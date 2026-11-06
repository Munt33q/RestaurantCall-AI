import {findCallerOrder,orderStatusResult,saveOrderCallback} from './voice-order-status';
import {callbackStages} from './callback-policy';
/** Authenticated ElevenAgents adapter with server-priced cash checkout. */
import {client} from './db/client';
import {listMenu,restaurantId} from './repository';
import {liveMenuResult} from './live-menu';
import {promotionRow} from './catalog-store';
import {promotionQuote} from './catalog-policy';
import {normalizeLines,type Line} from './order-contract';
import {validElevenLabsConversationId} from './elevenlabs-session';
import {checkoutEnabled,issueCustomerReview} from './customer-checkout';
import {directOrderingEnabled,issueVoiceReview,placeVoiceOrder,voiceReceipt} from './elevenlabs-order';
import {telephoneEnabled} from './telephone-checkout-config';
import {prepareTelephoneCheckout} from './telephone-checkout';

type ToolName='search_menu'|'get_cart'|'update_cart'|'set_customer_details'|'set_order_notes'|'set_notification_preference'|'review_order'|'confirm_order'|'get_order_status'|'place_order';
export type ToolInput={tool:ToolName;conversation_id:string;query?:string;item_id?:string;quantity?:number;operation?:'add'|'set'|'remove';customer_name?:string;customer_phone?:string;name_confirmed?:boolean;notes?:string;channel?:'none'|'sms'|'call';consent?:boolean;callback_stages?:('accepted'|'ready')[];callback_preference?:'accepted'|'ready'|'both'|'none';customer_confirmed?:boolean;review_id?:string;order_number?:string};
export class ToolError extends Error{constructor(public status:number,message:string){super(message);}}
const e164=(s:string)=>/^\+[1-9]\d{7,14}$/.test(s);
const conv=(s:string)=>/^[A-Za-z0-9_-]{8,128}$/.test(s);
const uuid=(s:string)=>/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(s);
const safeText=(s:string,max:number)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=max;
const publicItem=(m:any)=>({id:m.id,name:m.name,itemNumber:m.itemNumber,category:m.category,description:m.description,priceCents:m.priceCents,isAvailable:m.isAvailable&&(!Number.isInteger(m.stockQty)||m.stockQty>0),stockQty:m.stockQty});
export function conversationProviderIds(conversationId:string){return [conversationId,`elevenlabs:${conversationId}`];}

export function validateTool(input:unknown):ToolInput{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new ToolError(400,'Invalid tool payload');
 const b={...input} as Record<string,unknown>;
 const tools=['search_menu','get_cart','update_cart','set_customer_details','set_order_notes','set_notification_preference','review_order','confirm_order','get_order_status','place_order'];
 if(typeof b.tool!=='string'||!tools.includes(b.tool)||typeof b.conversation_id!=='string'||!conv(b.conversation_id))throw new ToolError(400,'Invalid tool name or conversation identifier');
 if(JSON.stringify(input).length>4096)throw new ToolError(413,'Payload too large');
 if(Object.keys(b).some(k=>!['tool','conversation_id','query','item_id','quantity','operation','customer_name','customer_phone','name_confirmed','notes','channel','consent','customer_confirmed','review_id','callback_stages','callback_preference','order_number'].includes(k)))throw new ToolError(400,'Unknown tool field');
 if(b.customer_confirmed!==undefined&&typeof b.customer_confirmed!=='boolean')throw new ToolError(400,'customer_confirmed must be a boolean');
 if(b.review_id!==undefined&&(typeof b.review_id!=='string'||!/^([a-f0-9]{64})$/.test(b.review_id)))throw new ToolError(400,'Invalid review_id');
 // Multipurpose provider schemas may send empty optional fields for unrelated actions.
 // Validate support fields only for the action that consumes them; never weaken session auth.
 if(!['get_order_status','set_notification_preference'].includes(String(b.tool)))delete b.order_number;
 else if(b.order_number==='')delete b.order_number;
 if(b.tool!=='set_notification_preference'){delete b.callback_preference;delete b.callback_stages;}
 else if(b.callback_preference==='')delete b.callback_preference;
 if(b.order_number!==undefined&&(typeof b.order_number!=='string'||!/^([a-f0-9]{8}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.test(b.order_number)))throw new ToolError(400,'Use the eight-character saved order number');
 if(b.callback_preference!==undefined&&!['accepted','ready','both','none'].includes(String(b.callback_preference)))throw new ToolError(400,'Invalid callback preference');
 if(b.callback_stages!==undefined)try{callbackStages(b.callback_stages);}catch{throw new ToolError(400,'Invalid callback stages');}
 return b as ToolInput;
}
function readItems(state:any):Line[]{const items=state?.items;return Array.isArray(items)?items:[];}

export async function runElevenLabsTool(body:ToolInput){
 // Never accept restaurant_id from the model. The deployment's configured restaurant is authoritative.
 const rid=restaurantId();
 if(!validElevenLabsConversationId(body.conversation_id))throw new ToolError(400,'Invalid ElevenLabs conversation identifier');
 const [bound]=await client()`SELECT provider_call_id FROM call_sessions WHERE restaurant_id=${rid} AND elevenlabs_conversation_id=${body.conversation_id} AND ((${(body.tool==='get_order_status'||body.tool==='place_order')} AND EXISTS(SELECT 1 FROM orders WHERE session_id=call_sessions.id)) OR (state='active' AND ended_at IS NULL AND expires_at>now()))`;
 if(!bound)throw new ToolError(409,'Conversation is not bound to an active RestaurantCall session');
 const callId=bound.provider_call_id;
 if(body.tool==='search_menu'){
  return liveMenuResult(body.query);
 }
 return client().begin(async tx=>{
  const [session]=await tx`SELECT * FROM call_sessions WHERE restaurant_id=${rid} AND provider_call_id=${callId} AND elevenlabs_conversation_id=${body.conversation_id} FOR UPDATE`;
  if(!session)throw new ToolError(409,'Session not found');
  if(body.tool==='get_order_status'||body.tool==='set_notification_preference'&&body.order_number){
   if(session.state!=='active'||session.ended_at||new Date(session.expires_at).getTime()<=Date.now())throw new ToolError(409,'Active call required');
   const order=await findCallerOrder(tx,session,body.order_number);
   if(!order)return {ok:false,code:'ORDER_NOT_FOUND',message:'No matching order was found for this restaurant and verified calling number. Ask for the saved order number and call from the original number.'};
   if(body.tool==='get_order_status')return orderStatusResult(order);
   if(process.env.ELEVENLABS_CALLBACK_PREFERENCES_ENABLED!=='true')throw new ToolError(503,'Callbacks are not configured');
   if(!body.callback_preference)throw new ToolError(400,'Choose accepted, ready, both or none');
   const stages=body.callback_preference==='none'?[]:body.callback_preference==='both'?['accepted','ready']:[body.callback_preference];
   if(stages.length&&body.consent!==true)throw new ToolError(400,'Explicit callback consent required');
   return saveOrderCallback(tx,order,stages,body.consent===true);
  }
  const [placed]=await tx`SELECT * FROM orders WHERE restaurant_id=${rid} AND session_id=${session.id}`;
  if(placed){if(body.tool==='place_order')return voiceReceipt(placed);if(body.tool==='confirm_order')return orderStatusResult(placed);throw new ToolError(409,'Order already placed; ask staff to change it');}
  if(session.state!=='active'||session.ended_at||new Date(session.expires_at).getTime()<=Date.now())throw new ToolError(409,'Session expired or ended');
  await tx`INSERT INTO draft_carts(session_id) VALUES(${session.id}) ON CONFLICT DO NOTHING`;
  const [draft]=await tx`SELECT * FROM draft_carts WHERE session_id=${session.id} FOR UPDATE`;
  if(body.tool==='place_order')return placeVoiceOrder(tx,session,draft,body);
  if(body.tool==='review_order'&&directOrderingEnabled())return issueVoiceReview(tx,session,draft);
  if(body.tool==='confirm_order'&&directOrderingEnabled())return {ok:false,code:'USE_PLACE_ORDER',message:'Read review_order aloud, get explicit verbal confirmation, then call place_order with its review_id and customer_confirmed=true.'};
  if(body.tool==='confirm_order'){
   if(telephoneEnabled()){
    try{return await tx.savepoint(stx=>prepareTelephoneCheckout(stx,session,draft));}
    catch{/* Preparation cannot bypass review. Existing signed web checkout remains available. */}
   }
   if(checkoutEnabled()){
    const review=await issueCustomerReview(tx,session,draft);
    return {...review,ok:false,code:'CUSTOMER_REVIEW_REQUIRED',message:'No order has been placed. The complete review must still be submitted on the signed restaurant confirmation page. A verbal confirmation, transcript, DTMF digit, or tool boolean cannot place an order.'};
   }
   return {ok:false,code:'CUSTOMER_REVIEW_REQUIRED',message:'No order has been placed. Use review_order and ask the customer to submit the complete review on the restaurant confirmation page. A verbal confirmation, transcript, DTMF digit, or tool boolean cannot place an order.'};
  }
  const state:any=draft.state_json??{};state.items=readItems(state);
  const save=async()=>{state.relayReviewReady=false;delete state.voiceReview;delete state.customerReview;delete state.customerReviewHash;await tx`UPDATE draft_carts SET state_json=${tx.json(state)},checkout_code_hash=NULL,checkout_expires_at=NULL,customer_name=${state.customerName||null},customer_phone=${session.caller_phone},version=version+1,updated_at=now() WHERE session_id=${session.id}`;
   if(telephoneEnabled())await tx`UPDATE telephone_checkouts SET state='aborted',updated_at=now() WHERE session_id=${session.id} AND state='prepared'`;
  };
  if(body.tool==='update_cart'){
   const itemId=body.item_id;
   if(typeof itemId!=='string'||!uuid(itemId))throw new ToolError(400,'Valid item_id required; use search_menu first');
   const operation=body.operation;
   if(operation!=='add'&&operation!=='set'&&operation!=='remove')throw new ToolError(400,'Invalid operation');
   let requestedQuantity=0;
   if(operation!=='remove'){
    const quantity=body.quantity;
    if(typeof quantity!=='number'||!Number.isInteger(quantity)||quantity<1||quantity>20)throw new ToolError(400,'Quantity must be 1–20');
    requestedQuantity=quantity;
   }
   const [item]=await tx`SELECT id,name,is_available,archived,stock_qty,special,special_starts_at,special_ends_at FROM menu_items WHERE id=${itemId} AND restaurant_id=${rid} FOR SHARE`;
   if(!item)throw new ToolError(404,'Item unavailable');
   const canSell=item.is_available&&!item.archived&&(!item.special||((!item.special_starts_at||new Date(item.special_starts_at)<=new Date())&&(!item.special_ends_at||new Date(item.special_ends_at)>new Date())));
   if(operation!=='remove'&&!canSell)throw new ToolError(409,'Item unavailable');
   const old=state.items.filter((l:Line)=>l.menuItemId!==itemId);
   const previous=state.items.find((l:Line)=>l.menuItemId===itemId)?.quantity??0;
   const next=operation==='remove'?0:operation==='set'?requestedQuantity:previous+requestedQuantity;
   if(next>20||next<0||(item.stock_qty!==null&&next>item.stock_qty))throw new ToolError(409,'Requested quantity is unavailable');
   state.items=next?normalizeLines([...old,{menuItemId:itemId,quantity:next}]):old;
   state.phase='ordering';state.quoteKey=undefined;
   await save();return {ok:true,cart:state.items,message:`Cart updated: ${item.name} quantity ${next}`};
  }
  if(body.tool==='set_customer_details'){
   const customerName=body.customer_name;
   if(typeof customerName!=='string'||!safeText(customerName,120))throw new ToolError(400,'Customer name required');
   const customerPhone=body.customer_phone;
   if(customerPhone!==undefined&&(typeof customerPhone!=='string'||!e164(customerPhone)||customerPhone!==session.caller_phone))throw new ToolError(400,'Callback number must match the verified caller');
   state.customerName=customerName.trim();state.nameConfirmed=body.name_confirmed===true;
   state.customerPhone=session.caller_phone;
   await save();return {ok:true,customerName:state.customerName,nameConfirmed:state.nameConfirmed,hasCallbackNumber:!!state.customerPhone};
  }
  if(body.tool==='set_order_notes'){
   if(typeof body.notes!=='string'||body.notes.length>500||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body.notes))throw new ToolError(400,'Special instructions must be at most 500 characters; use an empty string for none');
   state.notes=body.notes.trim();state.notesCollected=true;await save();return {ok:true,notes:state.notes};
  }
  if(body.tool==='set_notification_preference'){
   if(process.env.ELEVENLABS_CALLBACK_PREFERENCES_ENABLED!=='true')throw new ToolError(503,'Callback preferences are not enabled');
   const channel=body.callback_preference?(body.callback_preference==='none'?'none':'call'):body.channel;
   if(channel!=='none'&&channel!=='call')throw new ToolError(400,'Only optional telephone callbacks are supported');
   const selection=body.callback_preference;
   if(channel==='call'&&!selection&&!body.callback_stages)throw new ToolError(400,'A callback preference is required');
   const stages=channel==='none'||selection==='none'?[]:callbackStages(selection==='both'?['accepted','ready']:selection?[selection]:body.callback_stages);
   if(channel==='call'&&(body.consent!==true||!stages.length||!e164(session.caller_phone??'')))throw new ToolError(409,'Explicit consent, selected stages and verified caller required');
   state.notificationChannel=stages.length?'call':'none';state.notificationConsent=stages.length>0;state.callbackStages=stages;state.callbackPreferenceCollected=true;
   await save();return {ok:true,callbackStages:stages,consentRecorded:state.notificationConsent,deliveryEnabled:process.env.OUTBOUND_UPDATES_ENABLED==='true'};
  }
  if(body.tool==='get_cart')return {ok:true,cart:state.items,customerName:state.customerName??'',notes:state.notes??'',notesCollected:state.notesCollected===true,paymentMethod:'cash',notificationChannel:state.notificationChannel??'none',callbackStages:state.callbackStages??[]};
  if(process.env.ELEVENLABS_CHECKOUT_ENABLED==='true')return issueCustomerReview(tx,session,draft);
  // Recalculate using the same menu catalog and promotional policy used by insertOrder.
  if(!state.items.length)return {ok:false,code:'EMPTY_CART',message:'Add an item before reviewing'};
  const items=normalizeLines(state.items);
  const rows=await tx`SELECT id,name,category,price_cents,is_available,archived,stock_qty,special,special_starts_at,special_ends_at FROM menu_items WHERE restaurant_id=${rid} ORDER BY id`;
  const detail=items.map(l=>{const r=rows.find((x:any)=>x.id===l.menuItemId);if(!r||!r.is_available||r.archived||(r.stock_qty!==null&&r.stock_qty<l.quantity)||(r.special&&((r.special_starts_at&&new Date(r.special_starts_at)>new Date())||(r.special_ends_at&&new Date(r.special_ends_at)<=new Date()))))throw new ToolError(409,'Cart has an unavailable item; please review');return {itemId:r.id,name:r.name,category:r.category,priceCents:r.price_cents,quantity:l.quantity};});
  const [restaurant]=await tx`SELECT tax_rate_bps FROM restaurants WHERE id=${rid}`;
  const promotions=(await tx`SELECT * FROM promotions WHERE restaurant_id=${rid}`).map(promotionRow);
  const quote=promotionQuote(detail,restaurant.tax_rate_bps,promotions);
  return {ok:true,previewOnly:true,orderCreated:false,items:detail,quote,customerName:state.customerName??'',notificationChannel:state.notificationChannel??'none',warning:'Quote may change with stock, promotions or taxes. Final order commit requires verified playback and confirmation.'};
 });
}
