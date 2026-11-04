import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {fixture,databaseEnabled} from './helpers/postgres';import {openVoiceSession} from '../lib/repository';import {issueLiveRelayToken} from '../lib/relay-session';import {POST} from '../app/api/relay/action/route';import {RelayController} from '../lib/relay/controller';
test('phase4 actual action route and controller: missing review, late proof, repeated confirmation and one durable receipt',{skip:!databaseEnabled},async t=>{
 const {sql,restaurant,item}=await fixture(t);const call='phase4-'+crypto.randomUUID();await openVoiceSession(call,'+12025550123','https://synthetic.test');const token=await issueLiveRelayToken(call),connectionId=crypto.randomUUID();
 async function action(action:string,body:any={}){const response=await POST(new Request('http://localhost/api/relay/action',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,connectionId,...body})}));assert.equal(response.status,200,action);return response.json();}
 await action('connect');const sent:any[]=[],reasons:string[]=[];let latest:any;
 const controller=new RelayController({send:m=>sent.push(m),diagnostic:r=>reasons.push(r),prepare:async speech=>action('prepare',{speech}),commit:async prepared=>{latest=await action('commit',{preparedToken:prepared.preparedToken});return latest;},ack:async(deliveryId,playedText)=>{const reply=await action('ack',{deliveryId,playedText});assert.equal(reply.ok,true);},interrupt:async(heard,deliveryId)=>{await action('interrupt',{heard,deliveryId});}});t.after(async()=>controller.close());
 async function say(voicePrompt:string){await controller.handle({type:'prompt',voicePrompt,last:true});}
 for(const speech of ['add Classic Burger','done','Synthetic Fixture','yes','cash','none','no notes'])await say(speech);
 assert.equal(latest.phase,'confirm');assert.equal(latest.requiresReadback,true);
 // Even complete heard text cannot revive an interrupted delivery via a late ack.
 const interruptedId=latest.deliveryId,interruptedText=latest.reply;await action('interrupt',{deliveryId:interruptedId,heard:interruptedText});const staleAck=await action('ack',{deliveryId:interruptedId,playedText:interruptedText});assert.equal(staleAck.ok,false);assert.equal(staleAck.reason,'delivery_identity_mismatch');
 let [row]=await sql`SELECT count(*)::int AS n FROM orders WHERE restaurant_id=${restaurant}`;assert.equal(row.n,0);
 // Clear affirmative with no provider playback proof must produce a fresh review.
 await say('place it');assert.equal(latest.phase,'confirm');assert.equal(latest.requiresReadback,true);assert.match(latest.reply,/\$10\.82/);
 const failed=await action('ack',{deliveryId:latest.deliveryId,playedText:'Only part of review'});assert.equal(failed.ok,false);assert.equal(failed.reason,'playback_text_mismatch');
 await controller.handle({type:'info',name:'agentSpeaking',value:'off'});assert.ok(reasons.includes('playback_tokens_missing'));
 await controller.handle({type:'info',name:'tokensPlayed',value:latest.reply});
 await Promise.all([say('place it'),say('place it'),say('place it')]);assert.equal(latest.phase,'complete');const receipt=latest.reply;assert.match(receipt,/Order [0-9a-f]{8} is confirmed/);
 [row]=await sql`SELECT count(*)::int AS n FROM orders WHERE restaurant_id=${restaurant}`;assert.equal(row.n,1);
 let [stock]=await sql`SELECT stock_qty FROM menu_items WHERE id=${item}`;assert.equal(stock.stock_qty,9);
 // A receipt interruption and a distinct retry preserve the original number.
 await controller.handle({type:'interrupt',utteranceUntilInterrupt:'Order'});await say('confirm');assert.equal(latest.reply,receipt);assert.equal(latest.phase,'complete');
 await controller.handle({type:'info',name:'tokensPlayed',value:receipt});await controller.handle({type:'info',name:'agentSpeaking',value:'off'});assert.equal(sent.at(-1).type,'end');
 const [draft]=await sql`SELECT d.state_json FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id WHERE s.provider_call_id=${call}`;assert.equal(draft.state_json.relayCompletionPlayed,true);
 [row]=await sql`SELECT count(*)::int AS n FROM orders WHERE restaurant_id=${restaurant}`;assert.equal(row.n,1);[stock]=await sql`SELECT stock_qty FROM menu_items WHERE id=${item}`;assert.equal(stock.stock_qty,9);
 const jobs=await sql`SELECT * FROM notification_jobs WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id=${restaurant})`;assert.equal(jobs.length,0);
 // Transport binding uses the same disposable fixture before its connection closes.
 const transportCall='phase4-transport-'+crypto.randomUUID();await openVoiceSession(transportCall,'+12025550123','https://synthetic.test');
 const boundToken=await issueLiveRelayToken(transportCall,undefined,'call-control');assert.ok(boundToken);
 let [transportRow]=await sql`SELECT d.state_json FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id WHERE s.provider_call_id=${transportCall}`;assert.equal(transportRow.state_json.relayTransport,'call-control');
 await assert.rejects(()=>issueLiveRelayToken(transportCall),/transport mismatch/);
 const replacement=await issueLiveRelayToken(transportCall,transportRow.state_json.relayActiveNonce,'call-control');assert.ok(replacement);assert.notEqual(replacement,boundToken);
 [transportRow]=await sql`SELECT d.state_json FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id WHERE s.provider_call_id=${transportCall}`;assert.equal(transportRow.state_json.relayTransport,'call-control');
 const legacy='phase4-texml-'+crypto.randomUUID();await openVoiceSession(legacy,'+12025550123','https://synthetic.test');await issueLiveRelayToken(legacy);
 [transportRow]=await sql`SELECT d.state_json FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id WHERE s.provider_call_id=${legacy}`;assert.equal(transportRow.state_json.relayTransport,'texml');
});
