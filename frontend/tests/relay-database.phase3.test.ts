// New Phase 3 integration of the actual relay action route and durable grants.
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {fixture,databaseEnabled} from './helpers/postgres';
import {openVoiceSession} from '../lib/repository';import {issueLiveRelayToken} from '../lib/relay-session';import {verifyRelayToken} from '../lib/relay-token';import {POST} from '../app/api/relay/action/route';
test('signed relay claims identity, rejects false Unicode ack and stale reconnect, invalidates interruptions',{skip:!databaseEnabled},async t=>{
 const {sql}=await fixture(t);const call='relay-'+crypto.randomUUID();await openVoiceSession(call,'+12025550123','https://fixture.test');const token=await issueLiveRelayToken(call);const grant=verifyRelayToken(token)!;const connectionId=crypto.randomUUID();
 const invoke=(action:string,extra:Record<string,unknown>={},auth=token,connection=connectionId)=>POST(new Request('http://localhost/api/relay/action',{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify({action,connectionId:connection,...extra})}));
 assert.equal((await invoke('connect',{},token+'bad')).status,401);assert.equal((await invoke('connect')).status,200);assert.equal((await invoke('connect',{},token,crypto.randomUUID())).status,409);
 const [s]=await sql`SELECT id FROM call_sessions WHERE provider_call_id=${call}`;
 await sql`UPDATE draft_carts SET state_json=state_json || ${sql.json({phase:'confirm',relayDeliveryId:'review',relayDeliveryTurn:0,relayRequiresReadback:true,lastReply:'طلبك جاهز للتأكيد',relayReviewReady:false})}::jsonb WHERE session_id=${s.id}`;
 assert.equal((await invoke('ack',{deliveryId:'review',playedText:'لم أسمع الطلب'})).status,200);let [d]=await sql`SELECT state_json FROM draft_carts WHERE session_id=${s.id}`;assert.equal(d.state_json.relayReviewReady,false);
 await invoke('ack',{deliveryId:'old',playedText:'طلبك جاهز للتأكيد'});[d]=await sql`SELECT state_json FROM draft_carts WHERE session_id=${s.id}`;assert.equal(d.state_json.relayReviewReady,false);
 await invoke('ack',{deliveryId:'review',playedText:'طلبك جاهز للتأكيد'});[d]=await sql`SELECT state_json FROM draft_carts WHERE session_id=${s.id}`;assert.equal(d.state_json.relayReviewReady,true);
 assert.equal((await invoke('interrupt',{deliveryId:'review',heard:'طلبك'})).status,200);[d]=await sql`SELECT state_json FROM draft_carts WHERE session_id=${s.id}`;assert.equal(d.state_json.relayReviewReady,false);assert.equal(d.state_json.relayRevision,1);
 const tokens=await Promise.all([issueLiveRelayToken(call,grant.nonce),issueLiveRelayToken(call,grant.nonce)]);assert.deepEqual(verifyRelayToken(tokens[0]),verifyRelayToken(tokens[1]));const next=verifyRelayToken(tokens[0])!;assert.notEqual(next.nonce,grant.nonce);
 assert.equal((await invoke('ack',{deliveryId:'review',playedText:'طلبك جاهز للتأكيد'})).status,409);await assert.rejects(()=>issueLiveRelayToken(call,next.nonce),/retry exhausted/);
 assert.equal((await invoke('connect',{},tokens[0],crypto.randomUUID())).status,200);
});
