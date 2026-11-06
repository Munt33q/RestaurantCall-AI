import {randomBytes} from 'node:crypto';
import {snapshot,digest,CheckoutError} from './customer-checkout';
import {insertOrder} from './repository';
import {normalizeLines} from './order-contract';
import {recordOrderEvent} from './operations';

export const directOrderingEnabled=()=>process.env.ELEVENLABS_DIRECT_ORDERING_ENABLED==='true'&&process.env.RESTAURANT_ORDERING_ENABLED==='true';
function active(session:any){
 if(!directOrderingEnabled())throw new CheckoutError(503,'Direct voice ordering is disabled');
 if(session.elevenlabs_binding_source!=='provider_initiation'||session.state!=='active'||session.ended_at||new Date(session.expires_at).getTime()<=Date.now())throw new CheckoutError(409,'Provider-bound active call required');
}
export function voiceReceipt(order:any){return {ok:true,orderCreated:true,orderId:order.id,orderNumber:order.id.slice(0,8),status:order.status,paymentMethod:'cash',paymentStatus:order.payment_status,totalCents:order.total_cents,endCallAfterReceipt:true,message:`Your order #${order.id.slice(0,8)} has been received. Cash payment is due at pickup.`};}
export async function issueVoiceReview(tx:any,session:any,draft:any){
 active(session);
 if(process.env.ELEVENLABS_CALLBACK_PREFERENCES_ENABLED==='true'&&draft.state_json?.callbackPreferenceCollected!==true)throw new CheckoutError(409,'Ask whether the customer wants a call at restaurant acceptance, ready, both or neither, and record the preference first');
 if(draft.state_json?.nameConfirmed!==true)throw new CheckoutError(409,'Confirm the pickup name first');
 const review=await snapshot(tx,session,draft.state_json);
 const voiceReview={id:randomBytes(32).toString('hex'),hash:digest(JSON.stringify(review)),version:draft.version,expiresAt:Math.min(Date.now()+5*60000,new Date(session.expires_at).getTime())};
 await tx`UPDATE draft_carts SET state_json=${tx.json({...draft.state_json,voiceReview})},updated_at=now() WHERE session_id=${session.id}`;
 return {ok:true,orderCreated:false,review_id:voiceReview.id,review,expiresAt:new Date(voiceReview.expiresAt).toISOString(),message:'Read every item, quantity, pickup name, notes, selected callback stages and the total to the customer. Ask for explicit confirmation. Only then call place_order with this review_id and customer_confirmed=true. No order has been placed yet.'};
}
export async function placeVoiceOrder(tx:any,session:any,draft:any,input:{customer_confirmed?:boolean;review_id?:string}){
 active(session);
 if(input.customer_confirmed!==true)throw new CheckoutError(409,'Explicit customer verbal confirmation required');
 const saved=draft.state_json?.voiceReview;
 if(!saved||input.review_id!==saved.id||saved.version!==draft.version||saved.expiresAt<=Date.now())throw new CheckoutError(409,'Order review missing, changed or expired. Read a fresh review and ask for confirmation again.');
 if(draft.state_json.nameConfirmed!==true)throw new CheckoutError(409,'Confirm the pickup name first');
 const review=await snapshot(tx,session,draft.state_json);
 if(digest(JSON.stringify(review))!==saved.hash)throw new CheckoutError(409,'Items, availability or pricing changed. Read a fresh review and ask for confirmation again.');
 const stages=process.env.ELEVENLABS_CALLBACK_PREFERENCES_ENABLED==='true'?review.callbackStages:[];
 const order=await insertOrder(tx,{sessionId:session.id,customerName:review.customerName,customerPhone:session.caller_phone,paymentMethod:'cash',items:normalizeLines(draft.state_json.items),notes:review.notes,expectedQuote:review.quote,notificationChannel:stages.length?'call':'none',notificationConsent:stages.length>0,callbackStages:stages});
 await tx`UPDATE orders SET payment_status='unpaid' WHERE id=${order.id}`;
 const state={...draft.state_json,phase:'complete',relayReviewReady:false,voiceConfirmation:{reviewId:saved.id,reviewHash:saved.hash,at:new Date().toISOString(),method:'verbal'},orderReceipt:`Order ${order.id.slice(0,8)} is confirmed. Pay at pickup.`};
 await tx`UPDATE draft_carts SET state_json=${tx.json(state)},confirmation_state='confirmed',version=version+1,updated_at=now() WHERE session_id=${session.id}`;
 await recordOrderEvent(tx,order.id,'customer_voice_confirmation','customer_review_confirmed',{reviewHash:saved.hash,method:'verbal',provider:'elevenlabs'},'customer');
 return voiceReceipt({...order,payment_status:'unpaid'});
}
