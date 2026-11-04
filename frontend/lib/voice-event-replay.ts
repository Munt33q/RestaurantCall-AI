import crypto from 'node:crypto';import {client} from './db/client';
// This journal survives Telnyx's short command-id suppression window. Failed or
// interrupted dispatches are retried only while that provider window is safe.
export async function onceVoiceEvent<T>(key:string,work:()=>Promise<T>,sql:any=client()):Promise<T|{duplicate:true}>{
 const owner='voice-running:'+crypto.randomUUID();
 const claimed=await sql`INSERT INTO webhook_events(event_id,provider) VALUES(${key},${owner})
 ON CONFLICT(event_id) DO UPDATE SET provider=EXCLUDED.provider WHERE
 webhook_events.received_at>now()-interval '45 seconds' AND
 (webhook_events.provider LIKE 'voice-failed:%' OR (webhook_events.provider LIKE 'voice-running:%' AND webhook_events.received_at<now()-interval '30 seconds')) RETURNING event_id`;
 if(!claimed.length){const [old]=await sql`SELECT provider,received_at FROM webhook_events WHERE event_id=${key}`;
  if(old?.provider==='voice-done')return {duplicate:true};
  throw Error(old&&Date.now()-new Date(old.received_at).getTime()<30000?'VOICE_EVENT_IN_PROGRESS':'VOICE_EVENT_RECONCILIATION_REQUIRED');
 }
 try{const result=await work();const saved=await sql`UPDATE webhook_events SET provider='voice-done' WHERE event_id=${key} AND provider=${owner} RETURNING event_id`;
  if(!saved.length)throw Error('VOICE_EVENT_RECONCILIATION_REQUIRED');return result;
 }catch(error){await sql`UPDATE webhook_events SET provider=${'voice-failed:'+owner} WHERE event_id=${key} AND provider=${owner}`;throw error;}
}
