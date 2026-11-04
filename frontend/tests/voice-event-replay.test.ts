// Reconstructed journal ownership/retry contract against real PostgreSQL locks.
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {fixture,databaseEnabled} from './helpers/postgres';import {onceVoiceEvent} from '../lib/voice-event-replay';
test('done events stay done; only safe recent failures retry; stale work requires reconciliation',{skip:!databaseEnabled},async t=>{
 const {sql}=await fixture(t);let work=0;const key='phase3-event-'+crypto.randomUUID();const action=async()=>{work++;return {ok:true};};await onceVoiceEvent(key,action,sql);await sql`UPDATE webhook_events SET received_at=now()-interval '1 year' WHERE event_id=${key}`;assert.deepEqual(await onceVoiceEvent(key,action,sql),{duplicate:true});assert.equal(work,1);
 const retry=key+'retry';await assert.rejects(()=>onceVoiceEvent(retry,async()=>{throw Error('rejected');},sql),/rejected/);await onceVoiceEvent(retry,action,sql);assert.equal(work,2);
 const stale=key+'stale';await sql`INSERT INTO webhook_events(event_id,provider,received_at) VALUES(${stale},'voice-failed:old',now()-interval '46 seconds')`;await assert.rejects(()=>onceVoiceEvent(stale,action,sql),/RECONCILIATION_REQUIRED/);assert.equal(work,2);
 const running=key+'running';await sql`INSERT INTO webhook_events(event_id,provider) VALUES(${running},'voice-running:other')`;await assert.rejects(()=>onceVoiceEvent(running,action,sql),/IN_PROGRESS/);
});
