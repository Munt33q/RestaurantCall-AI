// Reconstructed receipt-warning persistence contract.
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {fixture,databaseEnabled} from './helpers/postgres';import {openVoiceSession,insertOrder} from '../lib/repository';import {flagUnheardOrder} from '../lib/call-receipt';
test('unheard receipt creates one warning/event; verified playback creates none',{skip:!databaseEnabled},async t=>{
 const {sql,item,restaurant}=await fixture(t);
 for(const played of [false,true]){const call='receipt-'+crypto.randomUUID();await openVoiceSession(call,'+12025550123','https://fixture.test');const [s]=await sql`SELECT id FROM call_sessions WHERE provider_call_id=${call}`;
 await sql`UPDATE draft_carts SET state_json=${sql.json({relayActiveNonce:'fixture',relayCompletionPlayed:played})} WHERE session_id=${s.id}`;
 const order=await sql.begin(tx=>insertOrder(tx,{sessionId:s.id,customerName:'Fixture',paymentMethod:'cash',items:[{menuItemId:item,quantity:1}]}));
 assert.equal(await sql.begin(tx=>flagUnheardOrder(tx,restaurant,call)),played?0:1);assert.equal(await sql.begin(tx=>flagUnheardOrder(tx,restaurant,call)),0);
 const [row]=await sql`SELECT notes FROM orders WHERE id=${order.id}`;assert.equal((row.notes??'').split('CALLER RECEIPT UNCONFIRMED:').length-1,played?0:1);
 const [events]=await sql`SELECT count(*)::int AS n FROM order_events WHERE order_id=${order.id} AND kind='caller_receipt_unconfirmed'`;assert.equal(events.n,played?0:1);}
});
