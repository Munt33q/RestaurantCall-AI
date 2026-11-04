import {client} from '../db/client';import {recoveryEnabled,expireRecovery} from './recovery-store';
import {openCredential,recoverySmsGate} from './recovery-contract';import {deliveryTransition} from '../notification-contract';
export async function runRecoveryJobs(transport:typeof fetch=fetch,sql:any=client(),restaurant=process.env.RESTAURANT_ID){
 if(!restaurant)return {processed:0};
 await expireRecovery(sql,restaurant);
 if(!recoveryEnabled())return {processed:0};
 await sql`UPDATE notification_jobs SET status='uncertain',last_error='Submission outcome unknown; inspect provider',locked_until=NULL,updated_at=now() WHERE restaurant_id=${restaurant} AND kind='draft_recovery' AND status='dispatching' AND locked_until<now()`;
 await sql`INSERT INTO engagement_events(session_id,event_key,kind) SELECT d.session_id,'abandoned','draft_abandoned' FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id WHERE s.restaurant_id=${restaurant} AND s.ended_at IS NOT NULL AND d.recoverable_until>now() AND d.recovery_resumed_session_id IS NULL AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.session_id=d.session_id) ON CONFLICT(session_id,event_key) DO NOTHING`;
 // A disconnect is established by terminal call state, never by silence alone.
 await sql`INSERT INTO notification_jobs(restaurant_id,draft_session_id,event_key,kind,channel,consent_at,recipient_hash)
 SELECT s.restaurant_id,d.session_id,'draft-recovery:'||d.session_id,'draft_recovery','sms',d.recovery_consent_at,d.recovery_caller_hash FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id
 WHERE s.restaurant_id=${restaurant} AND s.ended_at IS NOT NULL AND d.recoverable_until>now() AND d.recovery_consent_at IS NOT NULL AND d.recovery_resumed_session_id IS NULL AND d.recovery_token_cipher IS NOT NULL AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.session_id=d.session_id) ON CONFLICT(event_key) DO NOTHING`;
 const receipts=await sql`SELECT j.id,j.status,r.status AS receipt_status FROM notification_jobs j JOIN provider_receipts r ON r.provider_id=j.provider_id WHERE j.restaurant_id=${restaurant} AND j.kind='draft_recovery' AND j.status IN('submitted','uncertain','failed') ORDER BY r.occurred_at`;
 for(const r of receipts)await sql.begin(async(tx:any)=>{const [j]=await tx`SELECT status FROM notification_jobs WHERE id=${r.id} FOR UPDATE`;await tx`UPDATE notification_jobs SET status=${deliveryTransition(j.status,r.receipt_status)},updated_at=now() WHERE id=${r.id}`;});
 const jobs=await sql.begin(async(tx:any)=>{const rows=await tx`SELECT * FROM notification_jobs WHERE restaurant_id=${restaurant} AND kind='draft_recovery' AND status='pending' AND next_attempt_at<=now() FOR UPDATE SKIP LOCKED LIMIT 3`;for(const j of rows)await tx`UPDATE notification_jobs SET status='dispatching',attempts=attempts+1,locked_until=now()+interval '2 minutes' WHERE id=${j.id}`;return rows;});
 for(const job of jobs){try{await sql.begin(async(tx:any)=>{
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`recovery:${restaurant}:${job.recipient_hash}`},0))`;
  const [d]=await tx`SELECT d.*,s.caller_phone,EXISTS(SELECT 1 FROM orders o WHERE o.session_id=d.session_id) AS committed FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id WHERE d.session_id=${job.draft_session_id} AND s.restaurant_id=${restaurant} FOR UPDATE OF d`;
  if(!d)throw Error('Recovery draft missing');
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${restaurant}:${d.caller_phone}`},0))`;
  const [pref]=await tx`SELECT sms_opted_out FROM messaging_preferences WHERE restaurant_id=${restaurant} AND phone=${d.caller_phone}`;
  const [count]=await tx`SELECT count(*)::int AS n FROM notification_jobs WHERE restaurant_id=${restaurant} AND kind='draft_recovery' AND recipient_hash=${job.recipient_hash} AND id<>${job.id} AND submission_attempted_at>now()-interval '24 hours'`;
  const reason=recoverySmsGate({consent:!!d.recovery_consent_at&&!!d.recovery_token_cipher,smsEnabled:process.env.SMS_DELIVERY_ENABLED==='true',registered:process.env.SMS_REGISTRATION_VERIFIED==='true',recoveryEnabled:process.env.RECOVERY_SMS_ENABLED==='true',optedOut:pref?.sms_opted_out===true,phone:d.caller_phone??'',sentToday:count.n,expired:!d.recoverable_until||new Date(d.recoverable_until).getTime()<=Date.now(),claimed:!!d.recovery_resumed_session_id,committed:d.committed});
  if(reason){await tx`UPDATE notification_jobs SET status='suppressed',last_error=${reason},locked_until=NULL,updated_at=now() WHERE id=${job.id}`;return;}
  const key=process.env.TELNYX_API_KEY?.trim(),from=process.env.TELNYX_PHONE_NUMBER?.trim(),base=process.env.PUBLIC_APP_URL?.trim();if(!key||!from||!base)throw Error('Recovery sender configuration missing');
  const token=openCredential(d.recovery_token_cipher,process.env.DRAFT_RECOVERY_SECRET!);const url=new URL('/recover/'+encodeURIComponent(token),base);if(url.protocol!=='https:')throw Error('Recovery URL must use HTTPS');
  const templates:Record<string,string>={en:`RestaurantCall AI: Your unplaced draft is saved. Resume: ${url} Reply STOP to opt out; HELP for help.`,es:`RestaurantCall AI: Su borrador está guardado, no es un pedido. ${url} STOP para cancelar; HELP para ayuda.`,ar:`RestaurantCall AI: تم حفظ المسودة ولم يتم إرسال طلب. ${url} STOP للإلغاء؛ HELP للمساعدة.`,hi:`RestaurantCall AI: आपका ड्राफ्ट सहेजा गया है, ऑर्डर नहीं दिया गया। ${url} STOP रोकने के लिए; HELP सहायता।`};
  await tx`UPDATE notification_jobs SET submission_attempted_at=now() WHERE id=${job.id}`;
  let response:Response;try{response=await transport('https://api.telnyx.com/v2/messages',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({from,to:d.caller_phone,text:templates[d.recovery_language]??templates.en,webhook_url:new URL('/api/telnyx/messaging',base).toString()}),signal:AbortSignal.timeout(9000)});}catch{await tx`UPDATE notification_jobs SET status='uncertain',locked_until=NULL,last_error='Submission outcome unknown; no automatic retry',updated_at=now() WHERE id=${job.id}`;return;}
  const body=await response.json().catch(()=>null),id=body?.data?.id;
  if(!response.ok||typeof id!=='string'){await tx`UPDATE notification_jobs SET status=${response.ok||response.status>=500?'uncertain':'failed'},locked_until=NULL,last_error=${'Provider submission '+response.status},updated_at=now() WHERE id=${job.id}`;return;}
  await tx`UPDATE notification_jobs SET status='submitted',provider_id=${id},locked_until=NULL,last_error=NULL,updated_at=now() WHERE id=${job.id}`;
  await tx`INSERT INTO engagement_events(session_id,event_key,kind,data_json) VALUES(${d.session_id},'recovery_sms_submitted','recovery_sms_submitted','{}') ON CONFLICT(session_id,event_key) DO NOTHING`;
 });}catch{await sql`UPDATE notification_jobs SET status='uncertain',locked_until=NULL,last_error='Recovery worker failed; inspect provider before retrying',updated_at=now() WHERE id=${job.id} AND status='dispatching'`;}}
 return {processed:jobs.length};
}
