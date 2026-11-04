import {voiceCopy} from './voice-copy';
import {languageQuestion} from './call-language';
import {callerOrderHistory} from './caller-history';import {callPrecontext} from './call-precontext';import {listPromotions} from './catalog-store';
import {catalogRow,promotionRow,catalogAudit} from './catalog-store';
import {promotionQuote} from './catalog-policy';
import {engagementTurn} from './engagement/turn';
import {recoveryEnabled,recoveryCode,recoveryConsent,recoveryDeliveryReady,resumeRecovery,saveRecoveryDraft,recordEngagementEvents} from './engagement/recovery-store';
import {salesSummary} from './sales-context';
import crypto from 'node:crypto';
import {recordOrderEvent,enqueueStatus} from './operations';
import {gateRelayCheckout,type CheckoutResult} from './relay/checkout';
import type {EngagementEvent} from './engagement/turn';
import {client} from './db/client';
import {normalizeLines,nextKitchenStatus,type Line} from './order-contract';
import {initialState,decideTurn,cartQuote,readback,type CartState,type MenuEntry} from './voice-engine';
import {voiceXml,firstSpeech} from './voice-xml';
import {paymentDecision} from './payment-contract';
import type Stripe from 'stripe';
export function restaurantId(){const id=process.env.RESTAURANT_ID?.trim();if(!id)throw new Error('RESTAURANT_ID is required');return id;}
function menuRow(r:any){const m=catalogRow(r);const now=Date.now();return {...m,isAvailable:m.isAvailable&&!m.archived&&(!m.special||((!m.specialStartsAt||Date.parse(m.specialStartsAt)<=now)&&(!m.specialEndsAt||Date.parse(m.specialEndsAt)>now)))};}
function orderRow(r:any){return {id:r.id,isTest:r.is_test===true,customerName:r.customer_name,customerPhone:r.customer_phone,status:r.status,totalCents:r.total_cents,paymentMethod:r.payment_method,paymentStatus:r.payment_status,createdAt:new Date(r.created_at).toISOString(),checkoutUrl:r.checkout_url,smsStatus:r.sms_status,notificationChannel:r.notification_channel,notes:r.notes};}
export async function restaurantTaxRate(){const [r]=await client()`SELECT tax_rate_bps FROM restaurants WHERE id=${restaurantId()}`;if(!r)throw new Error('Restaurant not found');return r.tax_rate_bps as number;}
export async function listMenu(){return (await client()`SELECT * FROM menu_items WHERE restaurant_id=${restaurantId()} AND archived=false ORDER BY item_number NULLS LAST,name`).map(menuRow);}
export async function updateMenuAvailability(id:string,available:boolean){return client().begin(async tx=>{await tx`SELECT id FROM restaurants WHERE id=${restaurantId()} FOR UPDATE`;const [row]=await tx`UPDATE menu_items SET is_available=${available},version=version+1 WHERE id=${id} AND restaurant_id=${restaurantId()} RETURNING *`;if(row)await catalogAudit(tx,'availability_updated',row.id,{available});return row?menuRow(row):null;});}
export async function listOrders(){
 const rows=await client()`SELECT o.*, COALESCE((SELECT json_agg(json_build_object('itemName',i.item_name,'quantity',i.quantity,'lineTotalCents',i.line_total_cents)) FROM order_items i WHERE i.order_id=o.id),'[]'::json) AS items FROM orders o WHERE o.restaurant_id=${restaurantId()} ORDER BY o.created_at DESC LIMIT 100`;
 return rows.map(r=>({...orderRow(r),items:r.items}));
}
export async function updateOrderStatus(id:string,status:string){
 return client().begin(async tx=>{
  const [row]=await tx`SELECT * FROM orders WHERE id=${id} AND restaurant_id=${restaurantId()} FOR UPDATE`;
  if(!row)return null;
  if(row.status===status)return orderRow(row);
  if(!nextKitchenStatus(orderRow(row),status))throw new Error('Invalid order transition or payment not received');
  const [changed]=await tx`UPDATE orders SET status=${status} WHERE id=${id} RETURNING *`;await recordOrderEvent(tx,id,`status:${status}`,'status_changed',{from:row.status,to:status},process.env.DEMO_STAFF_USERNAME?.trim()||'staff');await enqueueStatus(tx,changed);return orderRow(changed);
 });
}
export async function voiceContext(providerCallId:string){
 const [row]=await client()`SELECT d.state_json AS state,d.version AS turn,r.tax_rate_bps,COALESCE((SELECT json_agg(h ORDER BY h.sequence) FROM (SELECT role,content,sequence FROM conversation_turns WHERE session_id=s.id ORDER BY sequence DESC LIMIT 6) h),'[]'::json) AS history FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id JOIN restaurants r ON r.id=s.restaurant_id WHERE s.provider_call_id=${providerCallId} AND s.restaurant_id=${restaurantId()}`;
 return row?{...row.state,turn:row.turn,taxRateBps:row.tax_rate_bps,history:row.history.map((t:any)=>({role:t.role,content:t.content}))}:null;
}
export async function openVoiceSession(providerCallId:string,phone:string|undefined,base:string){
 return client().begin(async tx=>{
  await tx`INSERT INTO call_sessions(restaurant_id,provider_call_id,caller_phone,expires_at) VALUES(${restaurantId()},${providerCallId},${phone??null},now()+interval '30 minutes') ON CONFLICT(provider_call_id) DO NOTHING`;
  const [session]=await tx`SELECT * FROM call_sessions WHERE provider_call_id=${providerCallId} AND restaurant_id=${restaurantId()} FOR UPDATE`;
  if(!session)throw new Error('Call belongs to another restaurant');
  if(new Date(session.expires_at)<new Date())return voiceXml('This call has expired. Please call again.',base,0,true);
  await tx`INSERT INTO draft_carts(session_id) VALUES(${session.id}) ON CONFLICT DO NOTHING`;
  const [cart]=await tx`SELECT * FROM draft_carts WHERE session_id=${session.id}`;
  const complete=cart.state_json.phase==='complete';
  return voiceXml(complete?'Your order has already been placed. Thank you.':(process.env.LANGUAGE_PREFERENCE_ENABLED==='true'?languageQuestion:'RestaurantCall AI. How can I help you today? How are you doing?'),base,cart.version,complete);
 });
}
export async function insertOrder(tx:any,input:{sessionId:string;customerName:string;customerPhone?:string|null;paymentMethod:'cash'|'stripe';items:Line[];notificationChannel?:'none'|'sms'|'call';notificationConsent?:boolean;paymentLinkSmsConsent?:boolean;notes?:string;expectedQuote?:ReturnType<typeof promotionQuote>;isTest?:boolean}){
 if(input.isTest&&input.paymentMethod!=='cash')throw Error('ACCEPTANCE_CASH_ONLY');
 const [existing]=await tx`SELECT * FROM orders WHERE session_id=${input.sessionId}`;if(existing)return existing;
 if(!input.customerName?.trim())throw new Error('Customer name is required');
 const items=normalizeLines(input.items);
 const [lockedRestaurant]=await tx`SELECT id FROM restaurants WHERE id=${restaurantId()} FOR UPDATE`;
 const rows=await tx`SELECT * FROM menu_items WHERE restaurant_id=${restaurantId()} ORDER BY id FOR UPDATE`;
 const [restaurant]=await tx`SELECT tax_rate_bps FROM restaurants WHERE id=${restaurantId()}`;
 if(!restaurant)throw new Error('Restaurant not found');
 const selected=items.map(line=>{const item=rows.find((r:any)=>r.id===line.menuItemId);if(!item||!menuRow(item).isAvailable||(item.stock_qty!==null&&item.stock_qty<line.quantity))throw new Error(`${item?.name??'Item'} is unavailable`);return {item,quantity:line.quantity};});
 const promotions=(await tx`SELECT * FROM promotions WHERE restaurant_id=${restaurantId()}`).map(promotionRow);
 const quote=promotionQuote(selected.map(({item,quantity})=>({itemId:item.id,priceCents:item.price_cents,quantity})),restaurant.tax_rate_bps,promotions);
 for(const {item,quantity} of selected)if(item.stock_qty!==null)await tx`UPDATE menu_items SET stock_qty=stock_qty-${quantity},version=version+1 WHERE id=${item.id}`;
 if(input.expectedQuote&&JSON.stringify(input.expectedQuote)!==JSON.stringify(quote))throw Error('QUOTE_CHANGED');
 const cash=input.paymentMethod==='cash',free=quote.totalCents===0;
 if(input.isTest){input={...input,notificationChannel:'none',notificationConsent:false,paymentLinkSmsConsent:false,notes:'CONTROLLED ACCEPTANCE TEST — DO NOT PREPARE. '+(input.notes??'')};}
 const [order]=await tx`INSERT INTO orders(is_test,restaurant_id,session_id,customer_name,customer_phone,payment_method,payment_status,status,subtotal_cents,tax_cents,total_cents,stock_reserved,confirmed_at,notification_channel,notification_consent_at,payment_sms_consent,payment_sms_consent_at,notes) VALUES(${input.isTest===true},${restaurantId()},${input.sessionId},${input.customerName.trim()},${input.customerPhone??null},${input.paymentMethod},${free?'paid':cash?'unpaid':'pending'},${cash||free?'confirmed':'awaiting_payment'},${quote.subtotalCents},${quote.taxCents},${quote.totalCents},true,${cash||free?new Date():null},${input.notificationConsent?input.notificationChannel??'none':'none'},${input.notificationConsent?new Date():null},${input.paymentLinkSmsConsent===true},${input.paymentLinkSmsConsent?new Date():null},${input.notes?.slice(0,500)||null}) RETURNING *`;
 for(const {item,quantity} of selected)await tx`INSERT INTO order_items(order_id,menu_item_id,item_name,quantity,unit_price_cents,line_total_cents) VALUES(${order.id},${item.id},${item.name},${quantity},${item.price_cents},${item.price_cents*quantity})`;
 if(!cash&&!free)await tx`INSERT INTO payment_jobs(order_id) VALUES(${order.id}) ON CONFLICT DO NOTHING`;
 await recordOrderEvent(tx,order.id,'created','order_created',{status:order.status,totalCents:order.total_cents});
 await recordOrderEvent(tx,order.id,'consent','consent_recorded',{channel:order.notification_channel,paymentSms:order.payment_sms_consent});
 await tx`UPDATE orders SET discount_cents=${quote.discountCents},pricing_snapshot=${tx.json(quote)} WHERE id=${order.id}`;
 await enqueueStatus(tx,order);
 return order;
}
export async function processVoiceTurn(input:{providerCallId:string;phone?:string;speech:string;turn:number;base:string;extracted?:Line[];interpretedSpeech?:string;operation?:'set';menuCategory?:string;assistantReply?:string;offeredItemIds?:string[];relay?:{revision:number;requestId:string;nonce:string}}):Promise<{xml:string;orderId:string|null;reply?:string;turn?:number;deliveryId?:string;finished?:boolean;phase?:string;requiresReadback?:boolean;languagePreference?:CartState['languagePreference'];languageSelectionRequired?:boolean}>{
 return client().begin(async tx=>{
  const [session]=await tx`SELECT * FROM call_sessions WHERE provider_call_id=${input.providerCallId} AND restaurant_id=${restaurantId()} FOR UPDATE`;
  if(!session)throw new Error('Unknown call session');
  const [previous]=await tx`SELECT response_xml FROM voice_requests WHERE session_id=${session.id} AND turn=${input.turn}`;
  if(previous&&!input.relay)return {xml:previous.response_xml,orderId:null,reply:firstSpeech(previous.response_xml),turn:input.turn+1};
  if(new Date(session.expires_at)<new Date())return {xml:voiceXml('This call expired. Please call again.',input.base,0,true),orderId:null,reply:'This call expired. Please call again.',turn:0,finished:true};
  const [cart]=await tx`SELECT * FROM draft_carts WHERE session_id=${session.id} FOR UPDATE`;
  if(!cart)throw new Error('Missing call draft');
  const acceptanceTest=cart.state_json.isAcceptanceTest===true;
  if(input.relay){
   if((cart.state_json.relayRevision??0)!==input.relay.revision||cart.state_json.relayActiveNonce!==input.relay.nonce)throw new Error('RELAY_STALE');
   if(previous){const saved=cart.state_json.relayResponses?.[String(input.turn)];if(saved?.requestId===input.relay.requestId&&saved.revision===input.relay.revision)return saved.result;throw new Error('RELAY_STALE');}
   if(input.turn!==cart.version)throw new Error('RELAY_STALE');
  }
  if(input.turn!==cart.version)return {xml:voiceXml('Please repeat your last response.',input.base,cart.version),orderId:null};
  await tx`SELECT id FROM restaurants WHERE id=${restaurantId()} FOR UPDATE`;
  const needsMenu=true;
  const menu=!needsMenu?[]:(await tx`SELECT * FROM menu_items WHERE restaurant_id=${restaurantId()} ORDER BY id FOR UPDATE`).map(menuRow);
  const [restaurant]=await tx`SELECT tax_rate_bps,catalog_revision FROM restaurants WHERE id=${restaurantId()} FOR SHARE`;
  cart.state_json.promotions=(await tx`SELECT * FROM promotions WHERE restaurant_id=${restaurantId()}`).map(promotionRow);
  cart.state_json.catalogRevision=restaurant.catalog_revision??0;
  const code=!acceptanceTest&&input.relay&&recoveryEnabled()?recoveryCode(input.speech):null;
  const restored=code?await resumeRecovery(tx,session,cart.state_json,code,menu):null;
  const recoveryRequest=input.relay?recoveryConsent(input.speech):null;
  const consent=acceptanceTest?null:recoveryRequest===false?false:recoveryEnabled()&&cart.state_json.phase==='ordering'?recoveryRequest:null;
  const result:CheckoutResult&{engagementEvents:EngagementEvent[]}=restored??(consent!==null?{state:structuredClone(cart.state_json) as CartState,reply:consent?(cart.state_json.items.length===0?'Please add an item before saving a draft. No recovery text will be sent.':recoveryDeliveryReady()?'If we disconnect, I will request one recovery text to the number you are calling from. The draft is not a placed order.':'Recovery texts are currently unavailable. No recovery text will be sent. You can ask staff for help with a saved draft.'):'No recovery text will be sent.',submit:false,endCall:false,engagementEvents:[]}:engagementTurn(cart.state_json as CartState,input.speech,menu,restaurant.tax_rate_bps,{appSpeech:!!input.relay,assistance:process.env.HESITATION_ASSIST_ENABLED==='true',upsell:process.env.UPSELL_ENABLED==='true',metrics:process.env.ENGAGEMENT_METRICS_ENABLED==='true'||recoveryEnabled(),turn:input.turn,interpretedSpeech:input.interpretedSpeech,extracted:input.extracted,operation:input.operation,menuCategory:input.menuCategory,assistantReply:input.assistantReply,offeredItemIds:input.offeredItemIds}));
  result.state.isAcceptanceTest=acceptanceTest;
  if(acceptanceTest&&result.submit&&result.state.paymentMethod!=='cash'){result.submit=false;result.state.phase='payment';result.reply='This controlled acceptance test uses cash only and will not charge a card. Please say cash at pickup.';}
  if(input.relay)gateRelayCheckout(result,cart.state_json.relayReviewReady===true,menu,restaurant.tax_rate_bps);
  let orderId:string|null=null;
  if(result.submit){
   // Savepoint keeps a stock conflict from losing the conversational response.
   try{const order=await tx.savepoint(async stx=>insertOrder(stx,{sessionId:session.id,customerName:result.state.customerName,customerPhone:session.caller_phone,paymentMethod:result.state.paymentMethod!,items:result.state.items,notificationChannel:result.state.notificationChannel,notificationConsent:result.state.notificationConsent,paymentLinkSmsConsent:result.state.paymentLinkSmsConsent,notes:result.state.notes,isTest:result.state.isAcceptanceTest===true,expectedQuote:result.state.quoteKey?JSON.parse(result.state.quoteKey)[1]:cartQuote(result.state,menu,restaurant.tax_rate_bps)}));
    orderId=order.id;const copy=(key:Parameters<typeof voiceCopy>[1])=>voiceCopy(result.state.languagePreference?.language,key,order.id.slice(0,8));
    result.reply=order.is_test?`Acceptance test order ${order.id.slice(0,8)} is recorded in the portal. This is a test; the kitchen must not prepare it. No card was charged. Thank you.`:order.total_cents===0?copy('freeReceipt'):order.payment_method==='cash'?copy('cashReceipt'):[copy('pendingReceipt'),copy(result.state.paymentLinkSmsConsent?'textRequested':'askLink'),copy('kitchenAfterPayment')].join(' ');
    result.state.orderReceipt=result.reply;
   }catch(error){if(error instanceof Error&&error.message==='QUOTE_CHANGED'){result.state.phase='confirm';result.state.quoteKey=undefined;result.state.relayReviewReady=false;result.reply=voiceCopy(result.state.languagePreference?.language,'changed')+' '+readback(result.state,menu,restaurant.tax_rate_bps);result.submit=false;result.reviewRequired=true;result.checkoutRejection='quote_changed';}else {if(!(error instanceof Error)||!error.message.endsWith(' is unavailable'))throw error;result.state.phase='ordering';result.reply='An item is no longer available in that quantity. Please say start over and choose again.';result.submit=false;}}
  }
  if(result.checkoutRejection)console.warn('VOICE_CONFIRMATION_REJECTED',{reason:result.checkoutRejection,turn:input.turn,phase:result.state.phase});
  const next=cart.version+1;
  result.state.lastReply=result.reply;if(result.endCall)(result.state as any).relayEndRequested=true;
  const deliveryId=input.relay?crypto.randomUUID():undefined;
  if(input.relay&&(orderId||result.state.phase==='complete'&&result.state.orderReceipt)){(result.state as any).relayOrderReceiptDeliveryId=deliveryId;(result.state as any).relayCompletionPlayed=false;}
  const requiresReadback=Boolean(input.relay&&result.state.phase==='confirm'&&result.reviewRequired===true);
  if(input.relay){
   result.state.relayReviewReady=result.state.phase==='confirm'&&!requiresReadback&&result.state.quoteKey===cart.state_json.quoteKey&&cart.state_json.relayReviewReady===true;
   result.state.relayRevision=cart.state_json.relayRevision??0;result.state.relayDeliveryId=deliveryId;result.state.relayDeliveryTurn=input.turn;result.state.relayRequiresReadback=requiresReadback;
  }
  const xml=voiceXml(result.reply,input.base,next,result.submit||result.endCall);
  const response={xml,orderId,reply:result.reply,languagePreference:result.state.languagePreference,languageSelectionRequired:process.env.LANGUAGE_PREFERENCE_ENABLED==='true'&&!result.state.languagePreference?.confirmed,turn:next,deliveryId,requiresReadback,finished:result.submit||result.endCall||result.state.phase==='complete',phase:result.state.phase};
  if(input.relay){const saved={...(cart.state_json.relayResponses??{}),[String(input.turn)]:{revision:input.relay.revision,requestId:input.relay.requestId,result:response}};(result.state as any).relayResponses=Object.fromEntries(Object.entries(saved).slice(-3));}
  await tx`UPDATE draft_carts SET state_json=${tx.json(result.state)},items_json=${JSON.stringify(result.state.items)},customer_name=${result.state.customerName||null},customer_phone=${session.caller_phone},confirmation_state=${result.submit?'confirmed':'unconfirmed'},version=${next},updated_at=now() WHERE session_id=${session.id}`;
  await recordEngagementEvents(tx,session.id,result.engagementEvents);
  if(input.relay)await saveRecoveryDraft(tx,session,result.state,input.speech);
  await tx`INSERT INTO conversation_turns(session_id,sequence,role,content) VALUES(${session.id},${input.turn*2},'user',${input.speech}),(${session.id},${input.turn*2+1},'assistant',${result.reply})`;
  await tx`INSERT INTO voice_requests(session_id,turn,response_xml) VALUES(${session.id},${input.turn},${xml})`;
  return response;
 });
}
export async function applyStripeEvent(event:Stripe.Event){
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type))return {ignored:true};
 const session=event.data.object as Stripe.Checkout.Session;
 return client().begin(async tx=>{
  const inserted=await tx`INSERT INTO webhook_events(event_id,provider) VALUES(${event.id},'stripe') ON CONFLICT DO NOTHING RETURNING event_id`;
  if(!inserted.length)return {duplicate:true};
  const id=session.metadata?.orderId;if(!id)return {ignored:true};
  // Match by stored checkout ID as well as untrusted metadata before casting a UUID.
  const [row]=await tx`SELECT * FROM orders WHERE id::text=${id} AND restaurant_id=${restaurantId()} FOR UPDATE`;
  if(!row)return {ignored:true};
  const decision=paymentDecision(event.type,session,{id:row.id,totalCents:row.total_cents,status:row.status,paymentStatus:row.payment_status,checkoutSessionId:row.checkout_session_id});
  if(decision==='paid'){const [paid]=await tx`UPDATE orders SET payment_status='paid',status='confirmed',confirmed_at=now() WHERE id=${row.id} RETURNING *`;await recordOrderEvent(tx,row.id,`payment:${event.id}`,'payment_received',{amountCents:row.total_cents});await enqueueStatus(tx,paid);}
  if(decision==='expired'){
   if(row.stock_reserved){const lines=await tx`SELECT menu_item_id,quantity FROM order_items WHERE order_id=${row.id} ORDER BY menu_item_id`;for(const l of lines)await tx`UPDATE menu_items SET stock_qty=stock_qty+${l.quantity},version=version+1 WHERE id=${l.menu_item_id} AND stock_qty IS NOT NULL`;}
   await tx`UPDATE orders SET payment_status='expired',status='cancelled',stock_reserved=false WHERE id=${row.id}`;await recordOrderEvent(tx,row.id,`expiry:${event.id}`,'payment_expired');
  }
  return {decision};
 });
}

export async function salesVoiceContext(menu:MenuEntry[]){try{const rows=await client()`SELECT i.menu_item_id,sum(i.quantity)::int AS quantity FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.restaurant_id=${restaurantId()} AND o.is_test=false AND (o.payment_status='paid' OR o.status='completed') AND o.created_at>now()-interval '30 days' GROUP BY i.menu_item_id ORDER BY quantity DESC,i.menu_item_id LIMIT 16`;return salesSummary(rows as any,menu);}catch{return 'Sales ranking is temporarily unavailable.';}}

export async function salesCallPrecontext(callId:string,menu:MenuEntry[],language='en'){
 const sql=client();const [s]=await sql`SELECT id,caller_phone FROM call_sessions WHERE provider_call_id=${callId} AND restaurant_id=${restaurantId()}`;
 const [history,bestsellers,promotions,restaurants]=await Promise.all([callerOrderHistory(restaurantId(),s?.caller_phone,s?.id),salesVoiceContext(menu),listPromotions(),sql`SELECT public_note FROM restaurants WHERE id=${restaurantId()}`]);
 return callPrecontext(language,history.previousOrders,bestsellers,promotions,restaurants[0]?.public_note??'');
}
