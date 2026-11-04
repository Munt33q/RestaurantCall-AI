import crypto from 'node:crypto';import {client} from '../db/client';import type {CartState,MenuEntry} from '../voice-engine';
import {credentialHash,sealCredential,recoveryGate,freshRecoveryState,DRAFT_TTL_MS} from './recovery-contract';
const configured=()=>process.env.DRAFT_RECOVERY_ENABLED==='true'&&(process.env.DRAFT_RECOVERY_SECRET?.length??0)>=32;
export const recoveryEnabled=configured;
export const recoveryDeliveryReady=()=>configured()&&process.env.SMS_DELIVERY_ENABLED==='true'&&process.env.RECOVERY_SMS_ENABLED==='true'&&process.env.SMS_REGISTRATION_VERIFIED==='true';
const key=()=>{const k=process.env.DRAFT_RECOVERY_SECRET;if(!k||k.length<32)throw Error('Recovery unavailable');return k;};
export function recoveryCode(speech:string){
 const normalized=speech.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[०-९]/g,c=>String(c.charCodeAt(0)-2406));
 return normalized.match(/^(?:resume(?: draft)?|recover(?: draft)?)?\s*((?:\d[ -]*){8})[.!]?$/i)?.[1]?.replace(/[ -]/g,'')??null;
}
export function recoveryConsent(speech:string):boolean|null{
 const t=speech.trim().toLowerCase().replace(/[.!?]+$/,'');
 if(['text me a recovery link if we disconnect','text me a link if we disconnect','send me a recovery text','envíame un enlace si se corta la llamada','أرسل لي رابطا إذا انقطع الاتصال','कॉल कटने पर मुझे लिंक भेजें'].includes(t))return true;
 if(['do not text me recovery links','no recovery texts','stop recovery texts'].includes(t))return false;
 return null;
}
export async function recordEngagementEvents(tx:any,sessionId:string,events:{kind:string;key:string;data:Record<string,unknown>}[]){for(const e of events)await tx`INSERT INTO engagement_events(session_id,event_key,kind,data_json) VALUES(${sessionId},${e.key},${e.kind},${tx.json(e.data)}) ON CONFLICT(session_id,event_key) DO NOTHING`;}
export async function saveRecoveryDraft(tx:any,session:any,state:CartState,speech:string){
 if(state.isAcceptanceTest)return;
 const consent=recoveryConsent(speech);
 if(consent===false){
  await tx`UPDATE draft_carts SET recovery_consent_at=NULL,recovery_token_hash=NULL,recovery_token_cipher=NULL,recovery_code_hash=NULL,recovery_code_until=NULL WHERE session_id=${session.id}`;
  await tx`UPDATE notification_jobs SET status='suppressed',last_error='Recovery consent withdrawn',updated_at=now() WHERE draft_session_id=${session.id} AND status='pending'`;return;
 }
 if(!configured())return;
 if(!state.items.length||state.phase==='complete'){
  await tx`UPDATE draft_carts SET recoverable_until=NULL,recovery_token_hash=NULL,recovery_token_cipher=NULL,recovery_code_hash=NULL,recovery_code_until=NULL,recovery_consent_at=NULL WHERE session_id=${session.id}`;
  await tx`UPDATE notification_jobs SET status='suppressed',last_error='Draft cleared or committed',updated_at=now() WHERE draft_session_id=${session.id} AND status='pending'`;return;
 }
 const phone=session.caller_phone;if(!/^\+[1-9]\d{7,14}$/.test(phone??''))return;
 const hash=credentialHash(phone,key(),'phone');const until=new Date(Date.now()+DRAFT_TTL_MS);
 await tx`UPDATE draft_carts SET recoverable_until=${until},recovery_caller_hash=${hash},recovery_language=${state.engagement?.language??'en'} WHERE session_id=${session.id} AND recovery_resumed_session_id IS NULL`;
 await recordEngagementEvents(tx,session.id,[{kind:'draft_saved',key:'draft-saved',data:{}}]);
 if(state.phase!=='ordering')return;
 if(consent===null)return;
 if(consent){
  if(!recoveryDeliveryReady())return;
  const token=crypto.randomBytes(32).toString('base64url');
  await tx`UPDATE draft_carts SET recovery_consent_at=now(),recovery_token_hash=COALESCE(recovery_token_hash,${credentialHash(token,key(),'token')}),recovery_token_cipher=COALESCE(recovery_token_cipher,${sealCredential(token,key())}) WHERE session_id=${session.id}`;
  await recordEngagementEvents(tx,session.id,[{kind:'recovery_consent',key:'recovery-consent',data:{purpose:'abandoned_draft_recovery',channel:'sms'}}]);
 }else{
  await tx`UPDATE draft_carts SET recovery_consent_at=NULL,recovery_token_hash=NULL,recovery_token_cipher=NULL,recovery_code_hash=NULL,recovery_code_until=NULL WHERE session_id=${session.id}`;
  await tx`UPDATE notification_jobs SET status='suppressed',last_error='Recovery consent withdrawn',updated_at=now() WHERE draft_session_id=${session.id} AND status='pending'`;
 }
}
export async function issueRecoveryCode(token:string,sql:any=client(),restaurant=process.env.RESTAURANT_ID){
 if(!configured()||!restaurant||!/^[-_A-Za-z0-9]{43}$/.test(token))return null;
 return sql.begin(async(tx:any)=>{
  const [d]=await tx`SELECT d.* FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id WHERE s.restaurant_id=${restaurant} AND d.recovery_token_hash=${credentialHash(token,key(),'token')} AND d.recoverable_until>now() AND d.recovery_resumed_session_id IS NULL AND d.recovery_code_issues<3 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.session_id=d.session_id) FOR UPDATE OF d`;
  if(!d)return null;const code=String(crypto.randomInt(0,100000000)).padStart(8,'0');const until=new Date(Math.min(new Date(d.recoverable_until).getTime(),Date.now()+600000));
  await tx`UPDATE draft_carts SET recovery_code_hash=${credentialHash(code,key(),'code')},recovery_code_until=${until},recovery_code_issues=recovery_code_issues+1 WHERE session_id=${d.session_id}`;
  return {code,expiresAt:until.toISOString()};
 });
}
export async function resumeRecovery(tx:any,session:any,current:CartState,code:string,menu:MenuEntry[]){
 if(current.isAcceptanceTest)return null;
 if(!configured()||current.phase!=='ordering'||current.items.length||current.engagement?.recoveryClosed||!/^\d{8}$/.test(code)||!/^\+[1-9]\d{7,14}$/.test(session.caller_phone??''))return null;
 const hash=credentialHash(session.caller_phone,key(),'phone');
 await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`recovery:${session.restaurant_id}:${hash}`},0))`;
 await tx`INSERT INTO recovery_attempts(restaurant_id,caller_hash) VALUES(${session.restaurant_id},${hash}) ON CONFLICT DO NOTHING`;
 const [attempt]=await tx`SELECT failures FROM recovery_attempts WHERE restaurant_id=${session.restaurant_id} AND caller_hash=${hash} AND day=CURRENT_DATE FOR UPDATE`;
 const [d]=await tx`SELECT d.*,EXISTS(SELECT 1 FROM orders o WHERE o.session_id=d.session_id) AS committed FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id WHERE s.restaurant_id=${session.restaurant_id} AND d.recovery_caller_hash=${hash} AND d.recovery_code_hash=${credentialHash(code,key(),'code')} AND d.session_id<>${session.id} FOR UPDATE OF d`;
 const denied=!d||recoveryGate({expiresAt:Math.min(new Date(d.recoverable_until).getTime(),new Date(d.recovery_code_until).getTime()),claimed:!!d.recovery_resumed_session_id,committed:d.committed,callerHash:hash,expectedHash:d.recovery_caller_hash,failures:attempt.failures},Date.now());
 if(denied){await tx`UPDATE recovery_attempts SET failures=LEAST(failures+1,5) WHERE restaurant_id=${session.restaurant_id} AND caller_hash=${hash} AND day=CURRENT_DATE`;return {state:{...current,engagement:{assistance:current.engagement?.assistance??{offered:false,declined:false,uncertainTurns:0,lastEvent:-1},upsell:current.engagement?.upsell??{offers:[],declined:false},language:current.engagement?.language??'en',recoveryClosed:true}},reply:'That draft cannot be recovered. You can start a fresh order or ask staff for help.',submit:false,endCall:false,engagementEvents:[]};}
 const restored=freshRecoveryState(d.state_json,menu);
 const state={...restored.state,languagePreference:current.languagePreference,languageAttempts:current.languageAttempts,engagement:current.engagement,relayRevision:current.relayRevision,relayReviewReady:false,relayActiveNonce:(current as any).relayActiveNonce};
 await tx`UPDATE draft_carts SET recovery_resumed_session_id=${session.id},recovery_token_hash=NULL,recovery_token_cipher=NULL,recovery_code_hash=NULL,recovery_code_until=NULL,recovery_consent_at=NULL WHERE session_id=${d.session_id}`;
 await tx`UPDATE draft_carts SET recovered_from_session_id=${d.session_id} WHERE session_id=${session.id}`;
 await tx`UPDATE notification_jobs SET status='suppressed',last_error='Draft resumed',updated_at=now() WHERE draft_session_id=${d.session_id} AND status='pending'`;
 await recordEngagementEvents(tx,session.id,[{kind:'draft_resumed',key:'resumed',data:{sourceSessionId:d.session_id,availabilityChanged:restored.changed}}]);
 return {state,reply:(restored.changed?'Some saved items are unavailable or quantities changed. ':'')+'Your saved draft is restored. Current menu prices and tax will apply. Please review your items and say checkout when ready; we will reconfirm your name, notes and payment choice.',submit:false,endCall:false,engagementEvents:[]};
}
export async function expireRecovery(sql:any=client(),restaurant=process.env.RESTAURANT_ID){
 if(!restaurant)return {expired:0};return sql.begin(async(tx:any)=>{
  const rows=await tx`UPDATE draft_carts d SET items_json='[]',state_json='{"phase":"ordering","items":[],"customerName":"","paymentMethod":null}'::jsonb,customer_name=NULL,customer_phone=NULL,recoverable_until=NULL,recovery_caller_hash=NULL,recovery_token_hash=NULL,recovery_token_cipher=NULL,recovery_code_hash=NULL,recovery_code_until=NULL,recovery_consent_at=NULL WHERE d.recoverable_until<=now() AND d.session_id IN(SELECT id FROM call_sessions WHERE restaurant_id=${restaurant}) AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.session_id=d.session_id) RETURNING session_id`;
  for(const row of rows)await tx`UPDATE notification_jobs SET status='suppressed',last_error='Draft expired',updated_at=now() WHERE draft_session_id=${row.session_id} AND status='pending'`;
  await tx`DELETE FROM recovery_attempts WHERE restaurant_id=${restaurant} AND day<CURRENT_DATE-1`;return {expired:rows.length};
 });
}
