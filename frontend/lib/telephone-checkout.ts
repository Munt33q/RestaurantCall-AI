import crypto from 'node:crypto';
import {client} from './db/client';
import {snapshot,digest,type Review} from './customer-checkout';
import {telephoneConfig,telephoneHandoffSecret,secureEqual} from './telephone-checkout-config';
import {recordOrderEvent} from './operations';
import {telnyxApi} from './telnyx-api';
import {normalizeLines} from './order-contract';

const rid=()=>{const id=process.env.RESTAURANT_ID?.trim();if(!id)throw Error('Restaurant unavailable');return id;};
type PhoneReview=Review&{notificationChannel:'call'|'none';notificationConsent:boolean};
type Event={id:string;event_type:string;occurred_at:string;payload:Record<string,unknown>};
type Phase='answering'|'review'|'prompt'|'gather'|'receipt'|'aborted'|'done';
const voice={voice:'AWS.Polly.Joanna-Neural',language:'en-US',payload_type:'text',target_legs:'self'};
const money=(cents:number)=>`$${(cents/100).toFixed(2)}`;
export function telephoneReviewText(r:PhoneReview){
 const q=r.quote;
 const text=[`${r.restaurantName}. Pickup order for ${r.customerName}.`,...r.items.map(i=>`${i.quantity} ${i.name}, ${money(i.priceCents)} each, ${money(i.priceCents*i.quantity)} for this item.`),`Subtotal ${money(q.subtotalCents)}. Discount ${money(q.discountCents)}. Tax ${money(q.taxCents)}. Final total ${money(q.totalCents)}.`,r.notes?`Special instructions: ${r.notes}.`:'No special instructions.', 'Payment is due in cash at pickup.',r.notificationChannel==='call'&&r.notificationConsent?'You requested one completion callback.':'No completion callback requested.','This is the end of your order review.'].join(' ');
 if(text.length>3000)throw Error('Telephone review exceeds the provider limit; use web confirmation');
 return text;
}
function reviewHash(review:PhoneReview){return digest(JSON.stringify(review));}
export async function prepareTelephoneCheckout(tx:any,session:any,draft:any){
 const config=telephoneConfig();
 if(session.elevenlabs_binding_source!=='provider_initiation'||session.state!=='active'||session.ended_at||new Date(session.expires_at).getTime()<=Date.now())throw Error('Active provider session required');
 if(draft.state_json.languagePreference?.language&&draft.state_json.languagePreference.language!=='en')throw Error('Use web review for this language until telephone language acceptance');
 if(draft.state_json.nameConfirmed!==true)throw Error('Confirm the pickup name first');
 const review:PhoneReview={...await snapshot(tx,session,draft.state_json),notificationChannel:draft.state_json.notificationChannel==='call'?'call':'none',notificationConsent:draft.state_json.notificationChannel==='call'&&draft.state_json.notificationConsent===true};
 const hash=reviewHash(review),text=telephoneReviewText(review);
 const [existing]=await tx`SELECT * FROM telephone_checkouts WHERE session_id=${session.id} AND state NOT IN ('done','aborted','ended') FOR UPDATE`;
 if(existing){
  if(existing.state==='prepared'&&existing.cart_version===draft.version&&existing.review_hash===hash)return transferResponse(config.uri);
  throw Error('Telephone confirmation already in progress; update the draft before starting again');
 }
 await tx`INSERT INTO telephone_checkouts(restaurant_id,session_id,source_conversation_id,cart_version,review_json,review_hash,review_text,notification_channel,notification_consent,stage_nonce,expires_at) VALUES(${rid()},${session.id},${session.elevenlabs_conversation_id},${draft.version},${tx.json(review)},${hash},${text},${review.notificationChannel},${review.notificationConsent},${crypto.randomBytes(24).toString('hex')},${new Date(Math.min(Date.now()+10*60000,new Date(session.expires_at).getTime()))})`;
 return transferResponse(config.uri);
}
function transferResponse(destination:string){return {ok:true,orderCreated:false,confirmationRequired:'telnyx_telephone_review',code:'TELEPHONE_TRANSFER_REQUIRED',transferDestination:destination,message:'No order has been placed. Use the configured SIP REFER transfer to the secure telephone confirmation line. The customer must hear its full review and then press 1. If transfer fails, use the existing web review.'};}

function clientState(row:any,phase:Phase,nonce:string){
 const body=Buffer.from(JSON.stringify({v:1,id:row.id,call:row.call_control_id,leg:row.call_leg_id,session:row.call_session_id,version:row.cart_version,hash:row.review_hash,phase,nonce})).toString('base64url');
 return Buffer.from(body+'.'+crypto.createHmac('sha256',telephoneConfig().secret).update(body).digest('base64url')).toString('base64');
}
function stateMatches(row:any,value:unknown){
 if(typeof value!=='string'||value.length>4096)return false;
 return secureEqual(value,clientState(row,row.state,row.stage_nonce));
}
async function command(tx:any,row:any,phase:Phase,action:string,body:Record<string,unknown>){
 const nonce=crypto.randomBytes(24).toString('hex'),id=crypto.randomUUID();
 await tx`UPDATE telephone_checkouts SET state=${phase},stage_nonce=${nonce},stage_issued_at=now(),updated_at=now() WHERE id=${row.id}`;
 await tx`INSERT INTO telephone_commands(id,checkout_id,call_control_id,action,body_json,stage_nonce) VALUES(${id},${row.id},${row.call_control_id},${action},${tx.json({...body,command_id:id,client_state:clientState(row,phase,nonce)})},${nonce})`;
}
function header(payload:Record<string,unknown>,name:string){
 if(!Array.isArray(payload.custom_headers))return '';
 const matches=payload.custom_headers.filter((h:any)=>h&&typeof h.name==='string'&&h.name.toLowerCase()===name.toLowerCase());
 return matches.length===1&&typeof matches[0].value==='string'?matches[0].value:'';
}
const callIdentity=(row:any,p:Record<string,unknown>)=>row.call_control_id===p.call_control_id&&row.call_leg_id===p.call_leg_id&&row.call_session_id===p.call_session_id&&row.application_id===p.connection_id;
export function validateTelephoneEvent(body:any):Event|null{
 const e=body?.data,p=e?.payload;
 if(!e||typeof e.id!=='string'||!/^[a-f\d-]{36}$/i.test(e.id)||typeof e.event_type!=='string'||!Number.isFinite(Date.parse(e.occurred_at))||!p||typeof p!=='object'||Array.isArray(p))return null;
 if(!['call_control_id','call_leg_id','call_session_id','connection_id'].every(k=>typeof p[k]==='string'&&p[k].length>0&&p[k].length<256))return null;
 return e;
}

// Call only after raw-body Ed25519 verification at the HTTP boundary. Test events
// are injected only by the isolated test harness, never through a runtime bypass.
export async function applyTelephoneEvent(event:Event){
 const config=telephoneConfig(),p=event.payload;
 if(p.connection_id!==config.app)return {ignored:true};
 if(!['call.initiated','call.answered','call.speak.ended','call.gather.ended','call.hangup'].includes(event.event_type))return {ignored:true};
 let checkoutId:string|undefined;
 const result=await client().begin(async tx=>{
  let found:any;
  if(event.event_type==='call.initiated'){
   const conversation=header(p,'X-Conversation-ID'),secret=header(p,'X-Restaurant-Handoff');
   if(!conversation||!secret||secret.length>128||p.direction!=='incoming'||p.to!==config.destination)return {ignored:true};
   [found]=await tx`SELECT t.id,t.session_id FROM telephone_checkouts t WHERE t.source_conversation_id=${conversation} AND t.restaurant_id=${rid()} AND t.state NOT IN ('done','aborted','ended')`;
  }else [found]=await tx`SELECT id,session_id FROM telephone_checkouts WHERE call_control_id=${String(p.call_control_id)} AND restaurant_id=${rid()}`;
  if(!found)return {ignored:true};
  // Preserve the same source-session/draft lock ordering as checkout and tools.
  const [session]=await tx`SELECT * FROM call_sessions WHERE id=${found.session_id} AND restaurant_id=${rid()} FOR UPDATE`;
  const [draft]=await tx`SELECT * FROM draft_carts WHERE session_id=${found.session_id} FOR UPDATE`;
  const [row]=await tx`SELECT * FROM telephone_checkouts WHERE id=${found.id} AND restaurant_id=${rid()} FOR UPDATE`;
  if(!session||!draft||!row)return {ignored:true};
  checkoutId=row.id;
  const replay=await tx`INSERT INTO webhook_events(event_id,provider) VALUES(${`phone:${rid()}:${event.id}`},'telnyx-telephone') ON CONFLICT DO NOTHING RETURNING event_id`;
  if(!replay.length)return {duplicate:true};
  if(event.event_type==='call.initiated'){
   if(row.state!=='prepared'||row.call_control_id||new Date(row.expires_at).getTime()<=Date.now()||row.cart_version!==draft.version)return {ignored:true};
   if(p.from!==session.caller_phone||!secureEqual(header(p,'X-Restaurant-Handoff'),telephoneHandoffSecret(row.source_conversation_id,session.provider_call_id)))return {ignored:true};
   Object.assign(row,{call_control_id:p.call_control_id,call_leg_id:p.call_leg_id,call_session_id:p.call_session_id,application_id:p.connection_id});
   await tx`UPDATE telephone_checkouts SET call_control_id=${String(p.call_control_id)},call_leg_id=${String(p.call_leg_id)},call_session_id=${String(p.call_session_id)},application_id=${config.app} WHERE id=${row.id}`;
   await command(tx,row,'answering','answer',{});return {received:true};
  }
  if(!callIdentity(row,p))return {ignored:true};
  if(event.event_type==='call.hangup'){
   await tx`UPDATE telephone_checkouts SET state='ended',updated_at=now() WHERE id=${row.id}`;
   await tx`UPDATE telephone_commands SET status='uncertain' WHERE checkout_id=${row.id} AND status IN ('pending','sending')`;
   return {received:true};
  }
  if(['done','aborted','ended','prepared'].includes(row.state))return {ignored:true};
  if(new Date(row.expires_at).getTime()<=Date.now()&&!row.order_id)return {ignored:true};
  // Signed event occurrence must follow the command that opened this stage.
  if(Date.parse(event.occurred_at)<new Date(row.stage_issued_at).getTime()-1000)return {ignored:true};
  if(event.event_type==='call.answered'&&row.state==='answering'){
   await command(tx,row,'review','speak',{...voice,payload:row.review_text});return {received:true};
  }
  if(!stateMatches(row,p.client_state))return {ignored:true};
  if(event.event_type==='call.speak.ended'){
   if(p.status!=='completed'){
    await command(tx,row,'aborted','hangup',{});return {aborted:true,reason:'playback_not_completed'};
   }
   if(row.state==='review'){
    if(row.cart_version!==draft.version){await abortReview(tx,row);return {aborted:true,reason:'cart_changed'};}
    await tx`UPDATE telephone_checkouts SET review_completed_at=${event.occurred_at} WHERE id=${row.id}`;
    // No gather exists during the full review or the keypad instruction.
    await command(tx,row,'prompt','speak',{...voice,payload:'To place this cash pickup order, press 1 after this instruction ends. Press 2 to leave it unsubmitted.'});return {received:true};
   }
   if(row.state==='prompt'){
    await command(tx,row,'gather','gather',{minimum_digits:1,maximum_digits:1,valid_digits:'12',timeout_millis:15000,initial_timeout_millis:15000});return {received:true};
   }
   if(row.state==='receipt'){
    if(row.order_id)await recordOrderEvent(tx,row.order_id,'telephone_receipt_played','telephone_receipt_played',{},'provider');
    await command(tx,row,'done','hangup',{});return {received:true};
   }
   return {ignored:true};
  }
  if(event.event_type!=='call.gather.ended'||row.state!=='gather'||!row.review_completed_at)return {ignored:true};
  if(p.status!=='valid'||p.digits!=='1'){
   await command(tx,row,'receipt','speak',{...voice,payload:'No order was placed through this telephone confirmation. Please return to the restaurant confirmation page or call again for help.'});return {declined:true};
  }
  if(row.cart_version!==draft.version){await abortReview(tx,row);return {aborted:true,reason:'cart_changed'};}
  const reviewed=row.review_json as PhoneReview;
  let order:any;
  try{
   order=await tx.savepoint(async stx=>{
    const fresh:PhoneReview={...await snapshot(stx,session,draft.state_json),notificationChannel:draft.state_json.notificationChannel==='call'?'call':'none',notificationConsent:draft.state_json.notificationChannel==='call'&&draft.state_json.notificationConsent===true};
    if(reviewHash(fresh)!==row.review_hash)throw Error('REVIEW_CHANGED');
    const {insertOrder}=await import('./repository');
    const [existing]=await stx`SELECT id FROM orders WHERE session_id=${session.id} AND restaurant_id=${rid()}`;
    if(existing)throw Error('ORDER_EXISTS');
    // PostgreSQL jsonb does not retain property order. Pass the freshly computed
    // quote in the order-engine's canonical shape after verifying the full hash.
    return insertOrder(stx,{sessionId:session.id,customerName:reviewed.customerName,customerPhone:session.caller_phone,paymentMethod:'cash',items:normalizeLines(draft.state_json.items),notes:reviewed.notes,expectedQuote:fresh.quote,notificationChannel:reviewed.notificationChannel,notificationConsent:reviewed.notificationConsent,isTest:draft.state_json.isAcceptanceTest===true});
   });
  }catch(error){
   // The savepoint rolls back the entire insert and inventory reservation. SQL
   // infrastructure failures must retry the event, not assert an order failure.
   if(error&&typeof error==='object'&&'code' in error)throw error;
   await abortReview(tx,row);return {aborted:true,reason:'order_revalidation_failed'};
  }
   // Keep receipt persistence in the outer transaction. An error here rolls back
   // the order too and returns 503, allowing a safe retry of this exact event.
   const number=order.id.slice(0,8),speech=`Your order number is ${number.split('').join(' ')}. Your order is saved. The total is ${money(order.total_cents)}. Please pay in cash at pickup. Thank you.`;
   await tx`UPDATE telephone_checkouts SET order_id=${order.id} WHERE id=${row.id}`;
   await tx`UPDATE draft_carts SET state_json=${tx.json({...draft.state_json,phase:'complete',relayReviewReady:false,orderReceipt:speech,telephoneConfirmation:{checkoutId:row.id,reviewHash:row.review_hash}})},confirmation_state='confirmed',version=version+1,updated_at=now() WHERE session_id=${session.id}`;
   await recordOrderEvent(tx,order.id,'telephone_confirmed','customer_review_confirmed',{method:'telnyx_dtmf_after_completed_playback',checkoutId:row.id,reviewHash:row.review_hash,cartVersion:row.cart_version},'customer');
   await command(tx,row,'receipt','speak',{...voice,payload:speech});return {received:true,orderId:order.id,orderNumber:number};
 });
 if(checkoutId&&event.event_type!=='call.hangup')await dispatchTelephoneCommands(checkoutId);
 return result;
}
async function abortReview(tx:any,row:any){
 await command(tx,row,'receipt','speak',{...voice,payload:'Your order changed or an item is unavailable. No new order was placed. Please ask Brittany for a fresh review or use the restaurant confirmation page.'});
}

export async function dispatchTelephoneCommands(checkoutId:string,api:typeof telnyxApi=telnyxApi){
 const sql=client();
 await sql`UPDATE telephone_commands c SET status='superseded',locked_until=NULL FROM telephone_checkouts t WHERE c.checkout_id=t.id AND t.id=${checkoutId} AND t.restaurant_id=${rid()} AND c.status IN ('pending','sending') AND c.stage_nonce IS DISTINCT FROM t.stage_nonce`;
 const rows=await sql`UPDATE telephone_commands c SET status='sending',locked_until=now()+interval '20 seconds' FROM telephone_checkouts t WHERE c.checkout_id=t.id AND t.id=${checkoutId} AND t.restaurant_id=${rid()} AND t.state<>'ended' AND c.stage_nonce=t.stage_nonce AND c.call_control_id=t.call_control_id AND (t.expires_at>now() OR t.order_id IS NOT NULL) AND (c.status='pending' OR (c.status='sending' AND c.locked_until<now())) AND c.created_at>now()-interval '45 seconds' RETURNING c.*`;
 for(const row of rows){
  try{
   await api('/calls/'+encodeURIComponent(row.call_control_id)+'/actions/'+row.action,'POST',row.body_json);
   await sql`UPDATE telephone_commands SET status='sent',sent_at=now(),locked_until=NULL WHERE id=${row.id}`;
  }catch{
   // Keep the same provider command ID for bounded webhook retry. Never invent
   // playback evidence or recreate a committed order after an uncertain send.
   await sql`UPDATE telephone_commands SET status='pending',locked_until=NULL WHERE id=${row.id}`;
   throw Error('TELEPHONE_COMMAND_PENDING');
  }
 }
 const [pending]=await sql`SELECT id FROM telephone_commands WHERE checkout_id=${checkoutId} AND status IN ('pending','sending','uncertain') LIMIT 1`;
 if(pending)throw Error('TELEPHONE_COMMAND_RECONCILIATION_REQUIRED');
}
