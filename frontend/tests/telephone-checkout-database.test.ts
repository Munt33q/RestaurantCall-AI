// Synthetic provider contract tests against real disposable Neon PostgreSQL.
// No events are sent to Telnyx, ElevenLabs, or a deployed Preview.
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {fixture,databaseEnabled} from './helpers/postgres';
import {initiateElevenLabsCall} from '../lib/elevenlabs-initiation';
import {runElevenLabsTool} from '../lib/elevenlabs-tools';
import {POST} from '../app/api/telnyx/phone-checkout/route';
import {listOrders,updateOrderStatus} from '../lib/repository';

test('telephone checkout secure state machine, transactional order, receipt and dashboard',{skip:!databaseEnabled},async t=>{
 const {sql,item,restaurant}=await fixture(t);await sql`UPDATE menu_items SET stock_qty=200 WHERE id=${item}`;
 Object.assign(process.env,{VERCEL_ENV:'preview',TELNYX_VOICE_CONFIRMATION_ENABLED:'true',RESTAURANT_ORDERING_ENABLED:'true',CASH_ONLY_CHECKOUT_ENABLED:'true',ELEVENLABS_CHECKOUT_ENABLED:'true',TELNYX_CONFIRMATION_APPLICATION_ID:'synthetic-confirmation-app',TELNYX_CONFIRMATION_DESTINATION:'+12025550110',TELNYX_CONFIRMATION_SIP_URI:'sip:confirmation@example.test',CUSTOMER_CHECKOUT_SECRET:'synthetic-telephone-checkout-secret-at-least-32',ELEVENLABS_AGENT_ID:'agent_fixture',ELEVENLABS_INBOUND_NUMBER:'+12025550101',ELEVENLABS_SESSION_BINDING_KEY:'synthetic-elevenlabs-session-binding-at-least-32',PUBLIC_APP_URL:'https://fixture.test',SMS_DELIVERY_ENABLED:'false',RECOVERY_SMS_ENABLED:'false'});
 const keys=crypto.generateKeyPairSync('ed25519');process.env.TELNYX_PUBLIC_KEY=keys.publicKey.export({format:'pem',type:'spki'}).toString();
 const originalFetch=global.fetch,commands:any[]=[];let rejectNext=false;
 global.fetch=async(input,init)=>{
  assert.match(String(input),/^https:\/\/api\.telnyx\.com\/v2\/calls\//,'No other external HTTP may occur in synthetic test');
  const body=JSON.parse(String(init?.body));commands.push({path:String(input),body});
  if(rejectNext){rejectNext=false;throw Error('synthetic uncertain command submission');}
  return Response.json({data:{result:'ok'}});
 };
 process.env.TELNYX_API_KEY='synthetic-not-a-provider-key';t.after(async()=>{global.fetch=originalFetch;});
 const make=async(channel:'call'|'none'='call')=>{
  const suffix=crypto.randomBytes(12).toString('hex'),conversation='conv_'+suffix,source='sip-'+suffix;
  process.env.ELEVENLABS_ACCEPTANCE_CALLERS='+12025550123';
  const init=await initiateElevenLabsCall({conversation_id:conversation,agent_id:'agent_fixture',caller_id:'+12025550123',called_number:'+12025550101',call_sid:source});
  const tool=(input:any)=>runElevenLabsTool({...input,conversation_id:conversation});
  await tool({tool:'update_cart',operation:'set',item_id:item,quantity:1});await tool({tool:'set_customer_details',customer_name:'Telephone Fixture',name_confirmed:true});await tool({tool:'set_order_notes',notes:'No onions'});await tool({tool:'set_notification_preference',channel,consent:channel==='call'});
  const prepared:any=await tool({tool:'confirm_order'});assert.equal(prepared.code,'TELEPHONE_TRANSFER_REQUIRED');assert.equal(prepared.orderCreated,false);
  const [row]=await sql`SELECT t.* FROM telephone_checkouts t JOIN call_sessions s ON s.id=t.session_id WHERE s.elevenlabs_conversation_id=${conversation}`;
  const identity={call_control_id:'v3:'+suffix,call_leg_id:crypto.randomUUID(),call_session_id:crypto.randomUUID(),connection_id:'synthetic-confirmation-app'};
  const event=(event_type:string,payload:any={},id=crypto.randomUUID())=>({data:{id,event_type,occurred_at:new Date().toISOString(),payload:{...identity,...payload}}});
  const send=async(e:any,signature?:string)=>{
   const raw=JSON.stringify(e),time=String(Math.floor(Date.now()/1000)),sig=signature??crypto.sign(null,Buffer.from(time+'|'+raw),keys.privateKey).toString('base64');
   return POST(new Request('https://fixture.test/api/telnyx/phone-checkout',{method:'POST',headers:{'telnyx-signature-ed25519':sig,'telnyx-timestamp':time},body:raw}));
  };
  const initiated=()=>event('call.initiated',{from:'+12025550123',to:'+12025550110',direction:'incoming',custom_headers:[{name:'X-Conversation-ID',value:conversation},{name:'X-Restaurant-Handoff',value:init.dynamic_variables.secret__restaurant_handoff}]});
  const state=async()=> (await sql`SELECT * FROM telephone_checkouts WHERE id=${row.id}`)[0];
  const latest=()=>commands.at(-1).body;
  const toReview=async()=>{assert.equal((await send(initiated())).status,200);assert.ok(commands.at(-1).path.endsWith('/answer'));assert.equal((await send(event('call.answered'))).status,200);assert.ok(commands.at(-1).path.endsWith('/speak'));assert.match(latest().payload,/Final total \$10\.82/);return latest().client_state;};
  const toGather=async()=>{const reviewState=await toReview();await send(event('call.speak.ended',{status:'completed',client_state:reviewState}));const promptState=latest().client_state;assert.match(latest().payload,/press 1/);await send(event('call.speak.ended',{status:'completed',client_state:promptState}));assert.ok(commands.at(-1).path.endsWith('/gather'));return latest().client_state;};
  return {tool,row,identity,event,send,initiated,state,latest,toReview,toGather};
 };
 await t.test('signature, secret headers and full call identity required; arbitrary early digits are ignored',async()=>{
  const f=await make(),before=commands.length;
  assert.equal((await f.send(f.initiated(),'invalid')).status,401);assert.equal(commands.length,before);
  const bad=f.initiated();bad.data.payload.custom_headers[1].value='forged';await f.send(bad);assert.equal(commands.length,before);
  const review=await f.toReview();await f.send(f.event('call.dtmf.received',{digit:'1'}));await f.send(f.event('call.gather.ended',{status:'valid',digits:'1',client_state:review}));assert.equal((await f.state()).state,'review');
  await f.send(f.event('call.speak.ended',{status:'completed',client_state:review,call_leg_id:crypto.randomUUID()}));assert.equal((await f.state()).state,'review');
  await f.send(f.event('call.speak.ended',{status:'completed',client_state:review,call_session_id:crypto.randomUUID()}));assert.equal((await f.state()).state,'review');
  await f.send(f.event('call.speak.ended',{status:'completed',client_state:review+'tamper'}));assert.equal((await f.state()).state,'review');
  assert.equal((await sql`SELECT count(*)::int AS n FROM orders WHERE session_id=${f.row.session_id}`)[0].n,0);
 });
 await t.test('review ending because of hangup or cancellation cannot open gather',async()=>{
  for(const status of ['call_hangup','cancelled_amd']){const f=await make(),review=await f.toReview();await f.send(f.event('call.speak.ended',{status,client_state:review}));assert.equal((await f.state()).state,'aborted');assert.ok(commands.at(-1).path.endsWith('/hangup'));}
 });
 await t.test('completed review and separate prompt precede valid keypad confirmation; concurrent retries commit once',async()=>{
  const f=await make(),gather=await f.toGather();
  // The conversation can terminate after SIP REFER. The new admitted leg owns liveness.
  await sql`UPDATE call_sessions SET state='ended',ended_at=now() WHERE id=${f.row.session_id}`;
  const event=f.event('call.gather.ended',{status:'valid',digits:'1',client_state:gather});
  const [inventoryBefore]=await sql`SELECT stock_qty FROM menu_items WHERE id=${item}`;
  const responses=await Promise.all([f.send(event),f.send(event)]);const receivedBodies=await Promise.all(responses.map(r=>r.status===200?r.json():Promise.resolve({})));
  assert.ok(responses.some(r=>r.status===200));const received=receivedBodies.find(r=>r.orderId);assert.ok(received?.orderId);
  const repeat=await f.send(event);assert.equal(repeat.status,200);assert.equal((await repeat.json()).duplicate,true);
  const different=await f.send(f.event('call.gather.ended',{status:'valid',digits:'1',client_state:gather}));assert.equal(different.status,200);
  const [order]=await sql`SELECT * FROM orders WHERE session_id=${f.row.session_id}`;
  assert.equal(order.id,received.orderId);assert.equal(order.total_cents,1082);assert.equal(order.payment_status,'unpaid');assert.equal(order.payment_method,'cash');assert.equal(order.notification_channel,'call');assert.ok(order.notification_consent_at);
  assert.equal((await sql`SELECT stock_qty FROM menu_items WHERE id=${item}`)[0].stock_qty,inventoryBefore.stock_qty-1);
  assert.equal((await sql`SELECT count(*)::int AS n FROM payment_jobs WHERE order_id=${order.id}`)[0].n,0);assert.equal((await sql`SELECT count(*)::int AS n FROM notification_jobs WHERE order_id=${order.id}`)[0].n,0);
  assert.ok((await listOrders()).some(o=>o.id===order.id));assert.ok(f.latest().payload.includes(order.id.slice(0,8).split('').join(' ')));
  const receiptState=f.latest().client_state;await f.send(f.event('call.speak.ended',{status:'completed',client_state:receiptState}));assert.equal((await f.state()).state,'done');assert.ok(commands.at(-1).path.endsWith('/hangup'));
  await updateOrderStatus(order.id,'preparing');await updateOrderStatus(order.id,'ready');assert.equal((await sql`SELECT count(*)::int AS n FROM notification_jobs WHERE order_id=${order.id} AND channel='call' AND kind='ready'`)[0].n,1);await updateOrderStatus(order.id,'completed');assert.equal((await sql`SELECT count(*)::int AS n FROM notification_jobs WHERE order_id=${order.id} AND channel='call' AND kind='completed'`)[0].n,0);
 });
 await t.test('only valid 1 confirms; timeout, invalid, cancellation and model-like status do not',async()=>{
  for(const status of ['invalid','timeout','cancelled','call_hangup','completed']){const f=await make(),gather=await f.toGather();await f.send(f.event('call.gather.ended',{status,digits:'1',client_state:gather}));assert.equal((await sql`SELECT count(*)::int AS n FROM orders WHERE session_id=${f.row.session_id}`)[0].n,0);}
 });
 await t.test('price, inventory and cart changes invalidate review; no partial reservation survives',async()=>{
  for(const change of ['price','stock','version']){
   const f=await make(),gather=await f.toGather();const [before]=await sql`SELECT stock_qty FROM menu_items WHERE id=${item}`;
   if(change==='price')await sql`UPDATE menu_items SET price_cents=1200 WHERE id=${item}`;
   if(change==='stock')await sql`UPDATE menu_items SET stock_qty=0 WHERE id=${item}`;
   if(change==='version')await f.tool({tool:'set_order_notes',notes:'Changed notes'});
   await f.send(f.event('call.gather.ended',{status:'valid',digits:'1',client_state:gather}));assert.equal((await sql`SELECT count(*)::int AS n FROM orders WHERE session_id=${f.row.session_id}`)[0].n,0);
   assert.equal((await sql`SELECT stock_qty FROM menu_items WHERE id=${item}`)[0].stock_qty,change==='stock'?0:before.stock_qty);
   await sql`UPDATE menu_items SET price_cents=1000,stock_qty=${before.stock_qty} WHERE id=${item}`;
  }
 });
 await t.test('prepared cart edits invalidate handoff, old secret cannot attach a second leg, immutable snapshots cannot change',async()=>{
  const f=await make();await assert.rejects(()=>sql`UPDATE telephone_checkouts SET review_hash='forged' WHERE id=${f.row.id}`,/immutable/);
  await f.tool({tool:'set_order_notes',notes:'Fresh'});await f.send(f.initiated());assert.equal((await f.state()).call_control_id,null);
  const other=await make();await other.toReview();await other.send(other.event('call.initiated',{...other.initiated().data.payload,call_control_id:'another-call'}));assert.equal((await other.state()).call_control_id,other.identity.call_control_id);
 });
 await t.test('failed command dispatch retries the same command ID without advancing or losing work',async()=>{
  const f=await make(),e=f.initiated();rejectNext=true;assert.equal((await f.send(e)).status,503);const commandId=f.latest().command_id;
  assert.equal((await f.send(e)).status,200);assert.equal(f.latest().command_id,commandId);assert.equal((await f.state()).state,'answering');
 });
 await t.test('expiry, cross-call stage tokens and explicit decline cannot create orders',async()=>{
  const f=await make(),g=await f.toGather(),other=await make();await other.toGather();
  await other.send(other.event('call.gather.ended',{status:'valid',digits:'1',client_state:g}));assert.equal((await other.state()).order_id,null);
  await other.send(other.event('call.gather.ended',{status:'valid',digits:'2',client_state:other.latest().client_state}));assert.equal((await other.state()).order_id,null);
  await sql`UPDATE telephone_checkouts SET expires_at=now()-interval '1 second' WHERE id=${f.row.id}`;
  await f.send(f.event('call.gather.ended',{status:'valid',digits:'1',client_state:g}));assert.equal((await f.state()).order_id,null);
 });
 await t.test('receipt persistence failure rolls back the order and inventory; exact retry succeeds without callback consent',async()=>{
  const f=await make('none'),g=await f.toGather(),e=f.event('call.gather.ended',{status:'valid',digits:'1',client_state:g});
  const [before]=await sql`SELECT stock_qty FROM menu_items WHERE id=${item}`;
  const functionName='telephone_fault_'+crypto.randomBytes(8).toString('hex');
  // Deliberately fail after insertOrder, entirely within this disposable tenant.
  await sql.unsafe(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_key='telephone_confirmed' AND NEW.data_json->>'checkoutId'='${f.row.id}' THEN RAISE EXCEPTION 'synthetic receipt persistence failure'; END IF; RETURN NEW; END $$`);
  await sql.unsafe(`CREATE TRIGGER ${functionName} BEFORE INSERT ON order_events FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
  try{
   assert.equal((await f.send(e)).status,503);assert.equal((await f.state()).state,'gather');
   assert.equal((await sql`SELECT count(*)::int AS n FROM orders WHERE session_id=${f.row.session_id}`)[0].n,0);
   assert.equal((await sql`SELECT stock_qty FROM menu_items WHERE id=${item}`)[0].stock_qty,before.stock_qty);
  }finally{await sql.unsafe(`DROP TRIGGER ${functionName} ON order_events`);await sql.unsafe(`DROP FUNCTION ${functionName}()`);}
  assert.equal((await f.send(e)).status,200);const [order]=await sql`SELECT * FROM orders WHERE session_id=${f.row.session_id}`;assert.equal(order.notification_channel,'none');assert.equal(order.notification_consent_at,null);
  await updateOrderStatus(order.id,'preparing');await updateOrderStatus(order.id,'ready');await updateOrderStatus(order.id,'completed');
  assert.equal((await sql`SELECT count(*)::int AS n FROM notification_jobs WHERE order_id=${order.id}`)[0].n,0);
 });
 await t.test('incomplete telephone configuration retains signed web-review fallback',async()=>{
  const f=await make(),destination=process.env.TELNYX_CONFIRMATION_SIP_URI;delete process.env.TELNYX_CONFIRMATION_SIP_URI;
  try{const fallback:any=await f.tool({tool:'confirm_order'});assert.equal(fallback.code,'CUSTOMER_REVIEW_REQUIRED');assert.equal(fallback.confirmationRequired,'customer_web_review');assert.equal(fallback.orderCreated,false);}
  finally{process.env.TELNYX_CONFIRMATION_SIP_URI=destination;}
 });
 await t.test('terminal call event blocks delayed confirmation; tenant switch cannot commit',async()=>{
  const f=await make(),gather=await f.toGather();await f.send(f.event('call.hangup'));await f.send(f.event('call.gather.ended',{status:'valid',digits:'1',client_state:gather}));assert.equal((await sql`SELECT count(*)::int AS n FROM orders WHERE session_id=${f.row.session_id}`)[0].n,0);
  const other=await make(),g=await other.toGather();process.env.RESTAURANT_ID=crypto.randomUUID();await other.send(other.event('call.gather.ended',{status:'valid',digits:'1',client_state:g}));process.env.RESTAURANT_ID=restaurant;assert.equal((await sql`SELECT count(*)::int AS n FROM orders WHERE session_id=${other.row.session_id}`)[0].n,0);
 });
});
