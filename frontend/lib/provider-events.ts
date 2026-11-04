import {client} from './db/client';
import {optOutKeyword,deliveryTransition,applyPreferenceEvent} from './notification-contract';
import {recordOrderEvent,reconcileReceipts} from './operations';
import {flagUnheardOrder} from './call-receipt';
const rid=()=>process.env.RESTAURANT_ID!.trim();
export async function applyMessagingEvent(event:any){
 const data=event?.data,p=data?.payload;if(!data?.id||!p)return {ignored:true};
 const type=data.event_type;if(!['message.received','message.sent','message.finalized'].includes(type))return {ignored:true};
 if(typeof data.id!=='string'||data.id.length>200)return {ignored:true};
 return client().begin(async tx=>{
  const inserted=await tx`INSERT INTO webhook_events(event_id,provider) VALUES(${`telnyx:${data.id}`},'telnyx-message') ON CONFLICT DO NOTHING RETURNING event_id`;if(!inserted.length)return {duplicate:true};
  if(type==='message.received'){
   const own=process.env.TELNYX_PHONE_NUMBER?.trim();if(!Array.isArray(p.to)||!p.to.some((t:any)=>t.phone_number===own))return {ignored:true};
   const phone=p.from?.phone_number,keyword=optOutKeyword(typeof p.text==='string'?p.text:'');if(!/^\+[1-9]\d{7,14}$/.test(phone??'')||!keyword)return {ignored:true};
   await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${rid()}:${phone}`},0))`;
   if(keyword==='stop'||keyword==='start'){
    const at=new Date(data.occurred_at??'');if(!Number.isFinite(at.getTime()))return {ignored:true};
    const [current]=await tx`SELECT sms_opted_out,last_event_at FROM messaging_preferences WHERE restaurant_id=${rid()} AND phone=${phone} FOR UPDATE`;
    const previous=current?{at:current.last_event_at instanceof Date?current.last_event_at.getTime():Number.NEGATIVE_INFINITY,stopped:current.sms_opted_out}:undefined;
    if(!applyPreferenceEvent(previous,{at:at.getTime(),stopped:keyword==='stop'}))return {stale:true};
    await tx`INSERT INTO messaging_preferences(restaurant_id,phone,sms_opted_out,last_event_at) VALUES(${rid()},${phone},${keyword==='stop'},${at}) ON CONFLICT(restaurant_id,phone) DO UPDATE SET sms_opted_out=EXCLUDED.sms_opted_out,last_event_at=EXCLUDED.last_event_at,updated_at=now()`;
    if(keyword==='stop')await tx`UPDATE notification_jobs SET status='suppressed',last_error='Customer opted out',updated_at=now() WHERE restaurant_id=${rid()} AND kind='draft_recovery' AND status='pending' AND draft_session_id IN(SELECT id FROM call_sessions WHERE restaurant_id=${rid()} AND caller_phone=${phone})`;
    if(keyword==='stop')await tx`UPDATE notification_jobs SET status='suppressed',last_error='Customer opted out',updated_at=now() WHERE restaurant_id=${rid()} AND channel='sms' AND status='pending' AND order_id IN(SELECT id FROM orders WHERE restaurant_id=${rid()} AND customer_phone=${phone})`;
   }
   // Provider-managed STOP/START/HELP replies avoid duplicate compliance responses.
   return {keyword};
  }
  const providerId=p.id;if(typeof providerId!=='string'||providerId.length>200)return {ignored:true};
  let status='submitted';if(type==='message.finalized'){const s=p.to?.[0]?.status;status=s==='delivered'?'delivered':['delivery_failed','sending_failed'].includes(s)?'failed':'uncertain';}
  const occurred=new Date(data.occurred_at??Date.now());if(!Number.isFinite(occurred.getTime()))return {ignored:true};
  await tx`INSERT INTO provider_receipts(event_id,provider_id,status,occurred_at) VALUES(${data.id},${providerId},${status},${occurred}) ON CONFLICT DO NOTHING`;
  const [job]=await tx`SELECT * FROM notification_jobs WHERE provider_id=${providerId} AND restaurant_id=${rid()} FOR UPDATE`;
  if(job){await reconcileReceipts(tx,job);if(job.order_id)await recordOrderEvent(tx,job.order_id,`receipt:${data.id}`,'notification_receipt',{channel:'sms',status});}
  return {received:true};
 });
}
export async function applyCallStatus(form:URLSearchParams,jobId?:string){
 const callId=form.get('CallSid')||form.get('CallControlId'),status=form.get('CallStatus');if(!callId||callId.length>256||!status||!['queued','initiated','ringing','in-progress','answered','completed','failed','busy','no-answer','canceled'].includes(status))return {ignored:true};
 const terminal=['completed','failed','busy','no-answer','canceled'].includes(status);
 return client().begin(async tx=>{
  await tx`INSERT INTO provider_receipts(event_id,provider_id,status,occurred_at) VALUES(${`call:${callId}:${status}`},${callId},${'call:'+status},now()) ON CONFLICT DO NOTHING`;
  const [job]=jobId?await tx`SELECT * FROM notification_jobs WHERE id::text=${jobId} AND restaurant_id=${rid()} AND channel='call' FOR UPDATE`:await tx`SELECT * FROM notification_jobs WHERE provider_id=${callId} AND restaurant_id=${rid()} AND channel='call' FOR UPDATE`;
  if(job){if(job.provider_id&&job.provider_id!==callId)return {ignored:true};
   const incoming=status==='completed'?'delivered':terminal?'failed':'submitted';const next=deliveryTransition(job.status,incoming);
   await tx`UPDATE notification_jobs SET provider_id=${callId},status=${next},updated_at=now() WHERE id=${job.id}`;
   await reconcileReceipts(tx,{...job,provider_id:callId,status:next});
   await recordOrderEvent(tx,job.order_id,`call:${callId}:${status}`,'notification_receipt',{channel:'call',status});
  }
  await tx`UPDATE calls SET status=${'outbound-'+status},ended_at=CASE WHEN ${terminal} THEN COALESCE(ended_at,now()) ELSE ended_at END WHERE telnyx_call_id=${callId} AND restaurant_id=${rid()} AND ended_at IS NULL`;
  if(!jobId&&terminal){await tx`UPDATE call_sessions SET state='ended',ended_at=COALESCE(ended_at,now()),outcome=COALESCE(outcome,${status}),updated_at=now() WHERE provider_call_id=${callId} AND restaurant_id=${rid()}`;await flagUnheardOrder(tx,rid(),callId);}
  return {received:true};
 });
}
