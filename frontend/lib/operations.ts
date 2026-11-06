import {callbackEvent,callbackWanted,callbackMessage,callbackRetryLimit,previewCallbackAllowed} from './callback-policy';
import {callerOrderHistory} from './caller-history';
import crypto from 'node:crypto';
import {client} from './db/client';
import {trackingUrl,verifyTrackingToken} from './tracking-token';
import {notificationGate,notificationText,deliveryTransition,canRecordCashPayment,smsDeliveryReady} from './notification-contract';
import {xmlEscape} from './telnyx';
const rid=()=>{const id=process.env.RESTAURANT_ID?.trim();if(!id)throw new Error('Restaurant not configured');return id;};
export async function recordOrderEvent(tx:any,orderId:string,key:string,kind:string,data:unknown={},actor='system'){
 await tx`INSERT INTO order_events(order_id,event_key,kind,data_json,actor) VALUES(${orderId},${key},${kind},${tx.json(data)},${actor}) ON CONFLICT(order_id,event_key) DO NOTHING`;
}
export async function enqueueStatus(tx:any,order:any){
 if(order.is_test||!['confirmed','preparing','ready','completed'].includes(order.status)||!order.notification_consent_at||order.notification_channel==='none')return;
 const event=order.notification_channel==='call'?callbackEvent(order.status):order.status;
 if(!event||order.notification_channel==='call'&&!callbackWanted(order,event))return;
 await tx`INSERT INTO notification_jobs(restaurant_id,order_id,event_key,kind,channel,consent_at) VALUES(${order.restaurant_id},${order.id},${`${order.id}:status:${event}`},${event},${order.notification_channel},${order.notification_consent_at}) ON CONFLICT(event_key) DO NOTHING`;
}
export async function enqueuePaymentSms(tx:any,order:any){
 if(order.is_test||!order.payment_sms_consent||!order.payment_sms_consent_at)return;
 await tx`INSERT INTO notification_jobs(restaurant_id,order_id,event_key,kind,channel,consent_at) VALUES(${order.restaurant_id},${order.id},${`${order.id}:payment_link`},'payment_link','sms',${order.payment_sms_consent_at}) ON CONFLICT(event_key) DO NOTHING`;
}
function callbackMac(job:string){const s=process.env.STAFF_SESSION_SECRET?.trim();if(!s)throw new Error('Callback signing missing');return crypto.createHmac('sha256',s).update('notification-callback:'+job).digest('base64url');}
export function validCallCallback(job:string,token:string){try{const a=Buffer.from(callbackMac(job)),b=Buffer.from(token);return a.length===b.length&&crypto.timingSafeEqual(a,b);}catch{return false;}}
export async function reconcileReceipts(tx:any,job:any){
 const rows=await tx`SELECT status FROM provider_receipts WHERE provider_id=${job.provider_id} ORDER BY occurred_at`;
 let status=job.status;for(const row of rows){const received=row.status.startsWith('call:')?(row.status==='call:completed'?'delivered':['call:failed','call:busy','call:no-answer','call:canceled'].includes(row.status)?'failed':'submitted'):row.status;status=deliveryTransition(status,received);}
 if(job.channel==='call'){const terminal=rows.findLast((r:{status:string})=>r.status.startsWith('call:')&&['completed','failed','busy','no-answer','canceled'].includes(r.status.slice(5)));if(terminal){const [o]=await tx`SELECT customer_phone FROM orders WHERE id=${job.order_id}`;await tx`INSERT INTO calls(restaurant_id,telnyx_call_id,caller_phone,status,ended_at) VALUES(${job.restaurant_id},${job.provider_id},${o?.customer_phone??null},${'outbound-'+terminal.status.slice(5)},now()) ON CONFLICT(telnyx_call_id) DO UPDATE SET status=CASE WHEN calls.ended_at IS NULL THEN EXCLUDED.status ELSE calls.status END,ended_at=COALESCE(calls.ended_at,EXCLUDED.ended_at)`;}}
 if(status!==job.status){await tx`UPDATE notification_jobs SET status=${status},updated_at=now() WHERE id=${job.id}`;if(job.kind==='payment_link')await tx`UPDATE orders SET sms_status=${status} WHERE id=${job.order_id}`;}
 return status;
}
export async function runNotificationJobs(orderId?:string,transport:typeof fetch=fetch,sql=client()){const restaurant=rid();
 await sql`UPDATE notification_jobs SET status='uncertain',last_error='Worker ended during submission; inspect provider before retrying',locked_until=NULL,updated_at=now() WHERE restaurant_id=${restaurant} AND status='dispatching' AND locked_until<now()`;
 const receiptJobs=await sql`SELECT j.* FROM notification_jobs j WHERE j.restaurant_id=${restaurant} AND j.provider_id IS NOT NULL AND j.status IN('submitted','uncertain','failed') AND EXISTS(SELECT 1 FROM provider_receipts r WHERE r.provider_id=j.provider_id AND (r.status IN('delivered','call:completed') OR (j.status='submitted' AND r.status IN('failed','uncertain','call:failed','call:busy','call:no-answer','call:canceled')))) ORDER BY j.created_at LIMIT 50`;
 for(const j of receiptJobs)await sql.begin(async tx=>{const [current]=await tx`SELECT * FROM notification_jobs WHERE id=${j.id} FOR UPDATE`;await reconcileReceipts(tx,current);});
 const jobs=await sql.begin(async tx=>{
  const rows=orderId?await tx`SELECT * FROM notification_jobs WHERE restaurant_id=${restaurant} AND order_id=${orderId} AND status='pending' AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 3`:await tx`SELECT * FROM notification_jobs WHERE restaurant_id=${restaurant} AND kind<>'draft_recovery' AND status='pending' AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 3`;
  for(const j of rows)await tx`UPDATE notification_jobs SET status='dispatching',locked_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() WHERE id=${j.id}`;
  return rows;
 });
 for(const job of jobs){
  try{
   await sql.begin(async tx=>{
    const [order]=await tx`SELECT * FROM orders WHERE id=${job.order_id} AND restaurant_id=${restaurant} FOR UPDATE`;if(!order)throw new Error('Unknown order');
    if(order.is_test){await tx`UPDATE notification_jobs SET status='suppressed',last_error='Test order: delivery prohibited',locked_until=NULL,updated_at=now() WHERE id=${job.id}`;return;}
    if(job.channel==='call'&&(!callbackWanted(order,job.kind)||!previewCallbackAllowed(order.customer_phone??''))){
     await tx`UPDATE notification_jobs SET status='suppressed',last_error='Callback consent, selected stage, active status or preview recipient no longer eligible',locked_until=NULL,updated_at=now() WHERE id=${job.id}`;
     return;
    }
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${restaurant}:${order.customer_phone}`},0))`;
    const [pref]=await tx`SELECT sms_opted_out FROM messaging_preferences WHERE restaurant_id=${restaurant} AND phone=${order.customer_phone??''}`;
    const reason=notificationGate({channel:job.channel,consent:!!job.consent_at&&(job.kind==='payment_link'?order.payment_sms_consent===true&&!!order.payment_sms_consent_at:!!order.notification_consent_at&&order.notification_channel===job.channel),optedOut:pref?.sms_opted_out===true,smsEnabled:smsDeliveryReady(),callsEnabled:process.env.OUTBOUND_UPDATES_ENABLED==='true',phone:order.customer_phone??'',kind:job.kind,orderStatus:order.status});
    const [count]=await tx`SELECT count(*)::int AS n FROM notification_jobs j JOIN orders other ON other.id=j.order_id WHERE j.restaurant_id=${restaurant} AND other.customer_phone=${order.customer_phone} AND j.channel=${job.channel} AND j.status IN('dispatching','submitted','delivered','uncertain') AND j.id<>${job.id} AND j.updated_at>now()-interval '1 hour'`;
    const error=reason??(count.n>=(job.channel==='call'?3:10)?'Hourly notification limit reached':null);
    if(error){const deferred=/disabled|limit/.test(error);await tx`UPDATE notification_jobs SET status=${deferred?'pending':'suppressed'},attempts=GREATEST(attempts-1,0),last_error=${error},locked_until=NULL,next_attempt_at=now()+interval '15 minutes',updated_at=now() WHERE id=${job.id}`;return null;}
    
   const key=process.env.TELNYX_API_KEY?.trim(),from=process.env.TELNYX_PHONE_NUMBER?.trim(),base=process.env.PUBLIC_APP_URL?.trim();if(!key||!from||!base||job.channel==='call'&&!process.env.TELNYX_TEXML_APPLICATION_ID?.trim())throw new Error('Notification provider configuration missing');
   const sms=job.channel==='sms';const url=sms?trackingUrl({id:order.id,restaurant_id:order.restaurant_id,tracking_version:order.tracking_version}):undefined;
   
   const [restaurantRow]=await tx`SELECT name FROM restaurants WHERE id=${restaurant}`;
   const restaurantName=restaurantRow?.name??'RestaurantCall AI';
   const voice=callbackMessage({id:String(order.id)},job.kind,restaurantName);
   const callback=new URL('/api/telnyx/call-status',base);callback.searchParams.set('job',job.id);callback.searchParams.set('token',callbackMac(job.id));
   const body=sms?{from,to:order.customer_phone,messaging_profile_id:process.env.TELNYX_MESSAGING_PROFILE_ID?.trim(),text:notificationText({id:order.id,status:order.status,payment_method:order.payment_method,total_cents:order.total_cents,customer_name:order.customer_name,restaurant_name:restaurantName},job.kind,url),webhook_url:base+'/api/telnyx/messaging'}:{From:from,To:order.customer_phone,Timeout:30,TimeLimit:60,Texml:`<Response><Say voice="Polly.Joanna-Neural">${xmlEscape(voice)}</Say><Hangup/></Response>`,StatusCallback:callback.toString(),StatusCallbackMethod:'POST',StatusCallbackEvent:'completed'};
   const endpoint=sms?'https://api.telnyx.com/v2/messages':`https://api.telnyx.com/v2/texml/calls/${process.env.TELNYX_TEXML_APPLICATION_ID?.trim()}`;
   // Dispatching is durable before this non-idempotent POST. Ambiguous outcomes are never retried automatically.
   await tx`UPDATE notification_jobs SET submission_attempted_at=now() WHERE id=${job.id}`;
   let response:Response;try{response=await transport(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(9000)});}catch{await tx`UPDATE notification_jobs SET status='uncertain',locked_until=NULL,last_error='Provider outcome unknown; inspect delivery before a new attempt',updated_at=now() WHERE id=${job.id}`;return;}
   const data=await response.json().catch(()=>null);const providerId=sms?data?.data?.id:data?.call_sid;
   if(!response.ok||typeof providerId!=='string'){const retry=response.status===429&&!providerId&&job.attempts+1<callbackRetryLimit();const ambiguous=response.status>=500||response.ok||typeof providerId==='string';await tx`UPDATE notification_jobs SET status=${retry?'pending':ambiguous?'uncertain':'failed'},next_attempt_at=now()+interval '1 minute',locked_until=NULL,last_error=${`Provider submission ${response.status}; ${ambiguous?'outcome uncertain':retry?'rate limited; bounded retry':'rejected'}`},updated_at=now() WHERE id=${job.id}`;return;}
    const [current]=await tx`SELECT * FROM notification_jobs WHERE id=${job.id} FOR UPDATE`;
    const status=deliveryTransition(current.status,'submitted');await tx`UPDATE notification_jobs SET provider_id=${providerId},status=${status},locked_until=NULL,last_error=NULL,updated_at=now() WHERE id=${job.id}`;
    if(sms&&job.kind==='payment_link')await tx`UPDATE orders SET sms_status=${status} WHERE id=${order.id}`;
    if(!sms)await tx`INSERT INTO calls(restaurant_id,telnyx_call_id,caller_phone,status) VALUES(${restaurant},${providerId},${order.customer_phone},'outbound-submitted') ON CONFLICT(telnyx_call_id) DO NOTHING`;
    await recordOrderEvent(tx,order.id,`notification:${job.id}:submitted`,'notification_submitted',{channel:job.channel,kind:job.kind,providerId});
    await reconcileReceipts(tx,{...current,status,provider_id:providerId});
   });
  }catch(error){console.error('Notification worker operation failed');await sql`UPDATE notification_jobs SET status='uncertain',locked_until=NULL,last_error=${(error instanceof Error?error.message:'Worker error').slice(0,180)},updated_at=now() WHERE id=${job.id} AND status='dispatching'`;}
 }
 return {processed:jobs.length};
}
export async function customerOrder(token:string){
 const grant=verifyTrackingToken(token);if(!grant||grant.restaurantId!==rid())return null;
 const sql=client();const [o]=await sql<{id:string;status:string;payment_status:string;payment_method:string;total_cents:number;discount_cents:number;subtotal_cents:number;tax_cents:number;checkout_url:string|null;checkout_session_id:string|null;created_at:Date;tracking_version:number}[]>`SELECT id,status,payment_status,payment_method,total_cents,discount_cents,subtotal_cents,tax_cents,checkout_url,checkout_session_id,created_at,tracking_version FROM orders WHERE id::text=${grant.orderId} AND restaurant_id=${grant.restaurantId}`;
 if(!o||o.tracking_version!==grant.version)return null;
 const items=await sql`SELECT item_name,quantity,line_total_cents FROM order_items WHERE order_id=${o.id}`;
 return {...o,items};
}
export async function orderDetail(id:string){
 const sql=client();const [order]=await sql`SELECT * FROM orders WHERE id::text=${id} AND restaurant_id=${rid()}`;if(!order)return null;
 const [items,events,notifications]=await Promise.all([sql`SELECT item_name,quantity,line_total_cents FROM order_items WHERE order_id=${order.id}`,sql`SELECT id,kind,actor,data_json,created_at FROM order_events WHERE order_id=${order.id} ORDER BY created_at,id`,sql`SELECT id,kind,channel,status,attempts,last_error,created_at,updated_at FROM notification_jobs WHERE order_id=${order.id} ORDER BY created_at`]);
 return {order:{...order,trackingUrl:trackingUrl({id:order.id,restaurant_id:order.restaurant_id,tracking_version:order.tracking_version})},items,events,notifications};
}
export async function listCalls(){
 const sql=client(),restaurant=rid();return sql`SELECT s.id,'inbound' AS direction,s.caller_phone,CASE WHEN s.ended_at IS NULL AND s.expires_at<now() THEN 'expired' ELSE s.state END AS status,s.outcome,s.created_at AS started_at,s.ended_at,CASE WHEN s.ended_at IS NOT NULL AND s.state='ended' THEN EXTRACT(EPOCH FROM s.ended_at-s.created_at)::int ELSE NULL END AS duration_seconds,o.id AS order_id,o.status AS order_status FROM call_sessions s LEFT JOIN orders o ON o.session_id=s.id WHERE s.restaurant_id=${restaurant} UNION ALL SELECT c.id,'outbound',c.caller_phone,c.status,NULL,c.started_at,c.ended_at,CASE WHEN c.ended_at IS NOT NULL THEN EXTRACT(EPOCH FROM c.ended_at-c.started_at)::int ELSE NULL END,j.order_id,o.status FROM calls c LEFT JOIN notification_jobs j ON j.provider_id=c.telnyx_call_id LEFT JOIN orders o ON o.id=j.order_id WHERE c.restaurant_id=${restaurant} AND c.status LIKE 'outbound-%' ORDER BY started_at DESC LIMIT 100`;
}
export async function callDetail(id:string){
 const sql=client();const [s]=await sql`SELECT s.id,s.caller_phone,s.state,s.outcome,s.created_at,s.ended_at,s.expires_at,o.id AS order_id FROM call_sessions s LEFT JOIN orders o ON o.session_id=s.id WHERE s.id::text=${id} AND s.restaurant_id=${rid()}`;
 if(!s){const [outbound]=await sql`SELECT c.id,c.caller_phone,c.status,c.started_at,c.ended_at,j.order_id FROM calls c LEFT JOIN notification_jobs j ON j.provider_id=c.telnyx_call_id WHERE c.id::text=${id} AND c.restaurant_id=${rid()}`;return outbound?{call:outbound,transcript:[],transcriptAvailable:false}:null;}
 const transcriptAvailable=new Date(s.created_at).getTime()>Date.now()-7*86400000;
 const transcript=transcriptAvailable?await sql`SELECT role,content,created_at FROM conversation_turns WHERE session_id=${s.id} ORDER BY sequence`:[];
 return {call:s,transcript,transcriptAvailable,callerHistory:await callerOrderHistory(rid(),s.caller_phone,s.id)};
}
export async function operationsSummary(){
 const sql=client(),restaurant=rid();const [orders,volume,notifications,calls]=await Promise.all([
 sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE payment_method='stripe')::int AS card_orders,count(*) FILTER(WHERE payment_method='stripe' AND payment_status='paid')::int AS paid_card_orders,COALESCE(sum(total_cents) FILTER(WHERE status NOT IN('cancelled','awaiting_payment')),0)::bigint AS confirmed_value_cents FROM orders WHERE restaurant_id=${restaurant} AND created_at>now()-interval '7 days'`,
 sql`SELECT date_trunc('hour',created_at) AS hour,count(*)::int AS orders FROM orders WHERE restaurant_id=${restaurant} AND created_at>now()-interval '24 hours' GROUP BY 1 ORDER BY 1`,
 sql`SELECT status,channel,count(*)::int AS count FROM notification_jobs WHERE restaurant_id=${restaurant} GROUP BY status,channel`,
 sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE ended_at IS NOT NULL AND state='ended')::int AS ended,round(avg(EXTRACT(EPOCH FROM ended_at-created_at)) FILTER(WHERE state='ended'))::int AS average_recorded_seconds FROM call_sessions WHERE restaurant_id=${restaurant} AND created_at>now()-interval '7 days'`
 ]);
 return {orders:orders[0],volume,notifications,calls:calls[0],delivery:{smsEnabled:smsDeliveryReady(),callsEnabled:process.env.OUTBOUND_UPDATES_ENABLED==='true',recoverySchedule:process.env.JOB_RECOVERY_SCHEDULE??'Not configured'},transcriptVisibilityDays:7};
}
export async function finishCallSession(callId:string,outcome:string){await client()`UPDATE call_sessions SET state='ended',ended_at=COALESCE(ended_at,now()),outcome=COALESCE(outcome,${outcome.slice(0,100)}),updated_at=now() WHERE provider_call_id=${callId} AND restaurant_id=${rid()}`;}
export async function confirmCashPayment(id:string){
 return client().begin(async tx=>{const [o]=await tx`SELECT * FROM orders WHERE id::text=${id} AND restaurant_id=${rid()} FOR UPDATE`;if(!o)return null;if(o.is_test||!canRecordCashPayment({payment_method:o.payment_method,status:o.status,payment_status:o.payment_status}))throw new Error('Cash collection cannot be recorded for this order');if(o.payment_status==='paid')return {paid:true};await tx`UPDATE orders SET payment_status='paid' WHERE id=${o.id}`;await recordOrderEvent(tx,o.id,'cash_collected','cash_payment_recorded',{amountCents:o.total_cents},process.env.DEMO_STAFF_USERNAME?.trim()||'staff');return {paid:true};});
}
