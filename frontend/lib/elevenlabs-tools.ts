/** Preview-only ElevenAgents adapter. Reuses Phase 4 order drafts/menu/pricing.
 * Order commits remain disabled until independently verified playback evidence exists.
 */
import {client} from './db/client';
import {listMenu,restaurantId} from './repository';
import {promotionRow} from './catalog-store';
import {promotionQuote} from './catalog-policy';
import {normalizeLines,type Line} from './order-contract';
import {validElevenLabsConversationId} from './elevenlabs-session';

type ToolName='search_menu'|'get_cart'|'update_cart'|'set_customer_details'|'set_notification_preference'|'review_order'|'confirm_order'|'get_order_status';
export type ToolInput={tool:ToolName;conversation_id:string;query?:string;item_id?:string;quantity?:number;operation?:'add'|'set'|'remove';customer_name?:string;customer_phone?:string;name_confirmed?:boolean;channel?:'none'|'sms'|'call';consent?:boolean};
export class ToolError extends Error{constructor(public status:number,message:string){super(message);}}
const e164=(s:string)=>/^\+[1-9]\d{7,14}$/.test(s);
const conv=(s:string)=>/^[A-Za-z0-9_-]{8,128}$/.test(s);
const uuid=(s:string)=>/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(s);
const safeText=(s:string,max:number)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=max;
const publicItem=(m:any)=>({id:m.id,name:m.name,itemNumber:m.itemNumber,category:m.category,description:m.description,priceCents:m.priceCents,isAvailable:m.isAvailable&&(!Number.isInteger(m.stockQty)||m.stockQty>0),stockQty:m.stockQty});
export function conversationProviderIds(conversationId:string){return [conversationId,`elevenlabs:${conversationId}`];}

export function validateTool(input:unknown):ToolInput{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new ToolError(400,'Invalid tool payload');
 const b=input as Record<string,unknown>;
 const tools=['search_menu','get_cart','update_cart','set_customer_details','set_notification_preference','review_order','confirm_order','get_order_status'];
 if(typeof b.tool!=='string'||!tools.includes(b.tool)||typeof b.conversation_id!=='string'||!conv(b.conversation_id))throw new ToolError(400,'Invalid tool name or conversation identifier');
 if(JSON.stringify(input).length>4096)throw new ToolError(413,'Payload too large');
 return input as ToolInput;
}
function readItems(state:any):Line[]{const items=state?.items;return Array.isArray(items)?items:[];}

export async function runElevenLabsTool(body:ToolInput){
 // Never accept restaurant_id from the model. The deployment's configured restaurant is authoritative.
 const rid=restaurantId();
 if(!validElevenLabsConversationId(body.conversation_id))throw new ToolError(400,'Invalid ElevenLabs conversation identifier');
 const ids=conversationProviderIds(body.conversation_id);
 const [bound]=await client()`SELECT provider_call_id FROM call_sessions WHERE restaurant_id=${rid} AND (elevenlabs_conversation_id=${body.conversation_id} OR provider_call_id=ANY(${ids})) AND state<>'ended' AND expires_at>now()`;
 if(!bound)throw new ToolError(409,'Conversation is not bound to an active RestaurantCall session');
 const callId=bound.provider_call_id;
 if(body.tool==='confirm_order')return {ok:false,code:'CHECKOUT_DISABLED',message:'Live checkout is disabled until verified ElevenAgents playback acknowledgment and final-confirmation integration is implemented. Never claim an order was placed.'};
 if(body.tool==='search_menu'){
  const q=typeof body.query==='string'?body.query.trim().slice(0,120).toLowerCase():'';
  const menu=await listMenu();
  const matching=menu.filter(m=>!q||[m.name,m.category,m.description,...(m.aliases??[])].some(x=>typeof x==='string'&&x.toLowerCase().includes(q))).slice(0,20);
  return {ok:true,matches:matching.map(publicItem),truncated:matching.length===20};
 }
 return client().begin(async tx=>{
  const [session]=await tx`SELECT id,expires_at FROM call_sessions WHERE restaurant_id=${rid} AND provider_call_id=${callId} FOR UPDATE`;
  if(!session||new Date(session.expires_at).getTime()<=Date.now())throw new ToolError(409,'Session expired or belongs to another restaurant');
  await tx`INSERT INTO draft_carts(session_id) VALUES(${session.id}) ON CONFLICT DO NOTHING`;
  const [draft]=await tx`SELECT state_json,version FROM draft_carts WHERE session_id=${session.id} FOR UPDATE`;
  const state:any=draft.state_json??{};state.items=readItems(state);
  const save=async()=>{state.relayReviewReady=false;state.elevenlabsPreviewOnly=true;await tx`UPDATE draft_carts SET state_json=${tx.json(state)},customer_name=${state.customerName||null},customer_phone=${state.customerPhone||null},version=version+1,updated_at=now() WHERE session_id=${session.id}`;};
  if(body.tool==='update_cart'){
   if(!uuid(body.item_id??''))throw new ToolError(400,'Valid item_id required; use search_menu first');
   if(!['add','set','remove'].includes(body.operation??''))throw new ToolError(400,'Invalid operation');
   const qty=body.operation==='remove'?0:body.quantity;
   if(body.operation!=='remove'&&(typeof qty!=='number'||!Number.isInteger(qty)||qty<1||qty>20))throw new ToolError(400,'Quantity must be 1–20');
   const [item]=await tx`SELECT id,name,is_available,archived,stock_qty,special,special_starts_at,special_ends_at FROM menu_items WHERE id=${body.item_id} AND restaurant_id=${rid} FOR SHARE`;
   if(!item)throw new ToolError(404,'Item unavailable');
   const canSell=item.is_available&&!item.archived&&(!item.special||((!item.special_starts_at||new Date(item.special_starts_at)<=new Date())&&(!item.special_ends_at||new Date(item.special_ends_at)>new Date())));
   if(body.operation!=='remove'&&!canSell)throw new ToolError(409,'Item unavailable');
   const old=state.items.filter((l:Line)=>l.menuItemId!==body.item_id);
   const previous=state.items.find((l:Line)=>l.menuItemId===body.item_id)?.quantity??0;
   const next=body.operation==='remove'?0:body.operation==='set'?qty!:previous+qty!;
   if(next>20||next<0||(item.stock_qty!==null&&next>item.stock_qty))throw new ToolError(409,'Requested quantity is unavailable');
   state.items=next?normalizeLines([...old,{menuItemId:body.item_id!,quantity:next}]):old;
   state.phase='ordering';state.quoteKey=undefined;
   await save();return {ok:true,cart:state.items,message:`Cart updated: ${item.name} quantity ${next}`};
  }
  if(body.tool==='set_customer_details'){
   if(!safeText(body.customer_name??'',120))throw new ToolError(400,'Customer name required');
   if(body.customer_phone!==undefined&&!e164(body.customer_phone))throw new ToolError(400,'Invalid callback number');
   state.customerName=body.customer_name!.trim();state.nameConfirmed=body.name_confirmed===true;
   if(body.customer_phone)state.customerPhone=body.customer_phone;
   await save();return {ok:true,customerName:state.customerName,nameConfirmed:state.nameConfirmed,hasCallbackNumber:!!state.customerPhone};
  }
  if(body.tool==='set_notification_preference'){
   if(!['none','sms','call'].includes(body.channel??''))throw new ToolError(400,'Invalid notification channel');
   if(body.channel!=='none'&&(body.consent!==true||!e164(state.customerPhone??'')))throw new ToolError(409,'Explicit consent and confirmed callback number required');
   state.notificationChannel=body.channel;state.notificationConsent=body.channel!=='none'&&body.consent===true;
   // Model-supplied consent is provisional; do not dispatch until separately validated in checkout.
   state.notificationConsentVerified=false;
   await save();return {ok:true,channel:state.notificationChannel,consentRecordedProvisionally:state.notificationConsent,deliveryEnabled:false};
  }
  if(body.tool==='get_order_status'){
   const [order]=await tx`SELECT id,status,payment_status FROM orders WHERE restaurant_id=${rid} AND session_id=${session.id}`;
   return order?{ok:true,orderNumber:order.id.slice(0,8),status:order.status,paymentStatus:order.payment_status}:{ok:false,code:'NO_PLACED_ORDER',message:'No confirmed order exists for this conversation'};
  }
  if(body.tool==='get_cart')return {ok:true,cart:state.items,customerName:state.customerName??'',notificationChannel:state.notificationChannel??'none'};
  // Recalculate using the same menu catalog and promotional policy used by insertOrder.
  if(!state.items.length)return {ok:false,code:'EMPTY_CART',message:'Add an item before reviewing'};
  const items=normalizeLines(state.items);
  const rows=await tx`SELECT id,name,price_cents,is_available,archived,stock_qty,special,special_starts_at,special_ends_at FROM menu_items WHERE restaurant_id=${rid} ORDER BY id`;
  const detail=items.map(l=>{const r=rows.find((x:any)=>x.id===l.menuItemId);if(!r||!r.is_available||r.archived||(r.stock_qty!==null&&r.stock_qty<l.quantity)||(r.special&&((r.special_starts_at&&new Date(r.special_starts_at)>new Date())||(r.special_ends_at&&new Date(r.special_ends_at)<=new Date()))))throw new ToolError(409,'Cart has an unavailable item; please review');return {itemId:r.id,name:r.name,priceCents:r.price_cents,quantity:l.quantity};});
  const [restaurant]=await tx`SELECT tax_rate_bps FROM restaurants WHERE id=${rid}`;
  const promotions=(await tx`SELECT * FROM promotions WHERE restaurant_id=${rid}`).map(promotionRow);
  const quote=promotionQuote(detail,restaurant.tax_rate_bps,promotions);
  return {ok:true,previewOnly:true,orderCreated:false,items:detail,quote,customerName:state.customerName??'',notificationChannel:state.notificationChannel??'none',warning:'Quote may change with stock, promotions or taxes. Final order commit requires verified playback and confirmation.'};
 });
}
