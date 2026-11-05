import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {fixture,databaseEnabled} from './helpers/postgres';
import {initiateElevenLabsCall,validateInitiation} from '../lib/elevenlabs-initiation';
import {runElevenLabsTool} from '../lib/elevenlabs-tools';
import {exchangeCustomerReview,confirmCustomerReview,openReviewGrant} from '../lib/customer-checkout';
import {bindElevenLabsConversation} from '../lib/elevenlabs-session';
import {listOrders,updateOrderStatus,insertOrder} from '../lib/repository';
import {confirmCashPayment,runNotificationJobs} from '../lib/operations';
import {applyMessagingEvent} from '../lib/provider-events';
import {POST as toolRoute} from '../app/api/elevenlabs/tools/route';
import {POST as messagingRoute} from '../app/api/telnyx/messaging/route';
import {POST as callStatusRoute} from '../app/api/telnyx/call-status/route';
import {POST as postCall} from '../app/api/elevenlabs/post-call/route';

test('Phase 6 actual database engine: provider binding, independent review, atomic cash order, kitchen and durable messaging',{skip:!databaseEnabled},async t=>{
 const {sql,restaurant,item}=await fixture(t);
 Object.assign(process.env,{ELEVENLABS_AGENT_ID:'agent_fixture',ELEVENLABS_INBOUND_NUMBER:'+12025550101',ELEVENLABS_SESSION_BINDING_KEY:'phase6-session-signing-fixture-at-least-32',ELEVENLABS_TOOL_API_KEY:'phase6-tool-signing-fixture-at-least-32',CUSTOMER_CHECKOUT_SECRET:'phase6-browser-signing-fixture-at-least-32',ELEVENLABS_WEBHOOKS_ENABLED:'true',ELEVENLABS_CHECKOUT_ENABLED:'true',RESTAURANT_ORDERING_ENABLED:'true',CASH_ONLY_CHECKOUT_ENABLED:'true',PUBLIC_APP_URL:'https://cafe.fixture.test'});
 const make=async(caller='+12025550123')=>{
  const suffix=crypto.randomBytes(10).toString('hex'),body=validateInitiation({conversation_id:'conv_'+suffix,agent_id:'agent_fixture',caller_id:caller,called_number:'+12025550101',call_sid:'provider-'+suffix});
  const init=await initiateElevenLabsCall(body);const tools=(input:any)=>runElevenLabsTool({...input,conversation_id:body.conversation_id});
  await tools({tool:'update_cart',operation:'set',item_id:item,quantity:1});await tools({tool:'set_customer_details',customer_name:'Phase Six Customer',name_confirmed:true});await tools({tool:'set_order_notes',notes:'No onions'});
  return {body,init,tools};
 };
 const c=await make();
 await t.test('duplicate initiation is idempotent; caller/agent/session rebinding fails',async()=>{
  assert.deepEqual(await initiateElevenLabsCall(c.body),c.init);
  await assert.rejects(()=>initiateElevenLabsCall({...c.body,caller_id:'+12025550124'}),/conflict/);
  await assert.rejects(()=>bindElevenLabsConversation({conversationId:'conv_different12345',providerCallId:c.body.call_sid}),/different/);
  const [n]=await sql`SELECT count(*)::int AS n FROM call_sessions WHERE elevenlabs_conversation_id=${c.body.conversation_id}`;assert.equal(n.n,1);
 });
 await t.test('valid tool auth alone cannot forge another session; bound secret succeeds',async()=>{
  const req=(secret?:string)=>new Request('https://cafe.fixture.test/api/elevenlabs/tools',{method:'POST',headers:{authorization:'Bearer '+process.env.ELEVENLABS_TOOL_API_KEY,'content-type':'application/json',...(secret?{'x-restaurant-session':secret}:{})},body:JSON.stringify({tool:'get_cart',conversation_id:c.body.conversation_id})});
  assert.equal((await toolRoute(req())).status,401);assert.equal((await toolRoute(req('forged'))).status,401);assert.equal((await toolRoute(req(c.init.dynamic_variables.secret__restaurant_session))).status,200);
  await assert.rejects(()=>c.tools({tool:'set_customer_details',customer_name:'Alex',customer_phone:'+12025550188'}),/verified caller/);
 });
 await t.test('verbal/tool confirmation cannot insert; name, notes, pricing and independent browser review required',async()=>{
  assert.equal((await c.tools({tool:'confirm_order'}) as any).code,'CUSTOMER_REVIEW_REQUIRED');
  assert.equal((await sql`SELECT count(*)::int AS n FROM orders WHERE restaurant_id=${restaurant}`)[0].n,0);
 });
 const issued:any=await c.tools({tool:'review_order'}),browser=await exchangeCustomerReview(issued.reviewCode);
 const input={csrf:browser.csrf,reviewAccepted:true as const,nameConfirmed:true as const,channel:'sms' as const,consent:true};
 await t.test('browser proof rejects forgery and cross-tenant replay',async()=>{
  await assert.rejects(()=>confirmCustomerReview(browser.cookie,{...input,csrf:'forged'}),/browser/);
  process.env.RESTAURANT_ID=crypto.randomUUID();assert.throws(()=>openReviewGrant(browser.cookie));process.env.RESTAURANT_ID=restaurant;
 });
 const [a,b]=await Promise.all([confirmCustomerReview(browser.cookie,input),confirmCustomerReview(browser.cookie,input)]);
 await t.test('concurrent confirmation commits once, reserves once and keeps cash unpaid',async()=>{
  assert.equal(a.orderId,b.orderId);assert.equal(a.totalCents,1082);assert.equal(a.paymentStatus,'unpaid');
  assert.equal((await sql`SELECT count(*)::int AS n FROM orders WHERE session_id=(SELECT id FROM call_sessions WHERE provider_call_id=${c.body.call_sid})`)[0].n,1);
  assert.equal((await sql`SELECT stock_qty FROM menu_items WHERE id=${item}`)[0].stock_qty,9);
  const [order]=await sql`SELECT * FROM orders WHERE id=${a.orderId}`;assert.equal(order.notes,'No onions');assert.equal(order.customer_phone,c.body.caller_id);assert.equal(order.is_test,false);assert.equal(order.payment_method,'cash');assert.equal(order.notification_channel,'sms');
  assert.equal((await c.tools({tool:'get_order_status'}) as any).orderNumber,a.orderNumber);
  assert.equal((await listOrders()).some(o=>o.id===a.orderId),true);
  assert.equal((await sql`SELECT count(*)::int AS n FROM payment_jobs WHERE order_id=${a.orderId}`)[0].n,0);
 });
 await t.test('new cart edit invalidates browser proof, and price changes force a fresh review',async()=>{
  const d=await make(),r:any=await d.tools({tool:'review_order'}),v=await exchangeCustomerReview(r.reviewCode);
  await d.tools({tool:'set_order_notes',notes:'Different notes'});
  await assert.rejects(()=>confirmCustomerReview(v.cookie,{...input,csrf:v.csrf}),/changed/);
  const r2:any=await d.tools({tool:'review_order'}),v2=await exchangeCustomerReview(r2.reviewCode);
  await sql`UPDATE menu_items SET price_cents=1100 WHERE id=${item}`;
  await assert.rejects(()=>confirmCustomerReview(v2.cookie,{...input,csrf:v2.csrf}),/pricing changed/);
  await sql`UPDATE menu_items SET price_cents=1000 WHERE id=${item}`;
 });
 await t.test('expired/ended calls and changed stock cannot commit; other-tenant sessions cannot enter order engine',async()=>{
  const d=await make(),r:any=await d.tools({tool:'review_order'}),v=await exchangeCustomerReview(r.reviewCode);
  Object.assign(process.env,{ELEVENLABS_SESSION_BINDING_ENABLED:'true',ELEVENLABS_POST_CALL_SECRET:crypto.randomBytes(32).toString('hex')});
  const raw=JSON.stringify({type:'post_call_transcription',data:{agent_id:d.body.agent_id,conversation_id:d.body.conversation_id,status:'done',transcript:[{message:'Synthetic content must not be copied to database'}]}}),timestamp=String(Math.floor(Date.now()/1000));
  const header='t='+timestamp+',v0='+crypto.createHmac('sha256',process.env.ELEVENLABS_POST_CALL_SECRET!).update(timestamp+'.'+raw).digest('hex');
  const request=(signature=header)=>new Request('https://cafe.fixture.test/api/elevenlabs/post-call',{method:'POST',headers:{'elevenlabs-signature':signature},body:raw});
  assert.equal((await postCall(request('forged'))).status,401);assert.equal((await postCall(request())).status,200);assert.equal((await (await postCall(request())).json()).closed,false);
  assert.equal((await sql`SELECT count(*)::int AS n FROM conversation_turns WHERE session_id=(SELECT id FROM call_sessions WHERE provider_call_id=${d.body.call_sid})`)[0].n,0);
  await assert.rejects(()=>confirmCustomerReview(v.cookie,{...input,csrf:v.csrf}),/no longer active/);
  await assert.rejects(()=>sql.begin(tx=>insertOrder(tx,{sessionId:crypto.randomUUID(),customerName:'Forged',paymentMethod:'cash',items:[{menuItemId:item,quantity:1}]})),/belong/);
  const e=await make(),r2:any=await e.tools({tool:'review_order'}),v2=await exchangeCustomerReview(r2.reviewCode);
  await sql`UPDATE menu_items SET stock_qty=0 WHERE id=${item}`;await assert.rejects(()=>confirmCustomerReview(v2.cookie,{...input,csrf:v2.csrf}),/available/);await sql`UPDATE menu_items SET stock_qty=9 WHERE id=${item}`;
 });
 await t.test('one authoritative SMS per status, signed receipt processing, no duplicate sends and STOP suppression',async()=>{
  Object.assign(process.env,{SMS_DELIVERY_ENABLED:'true',SMS_REGISTRATION_VERIFIED:'true',SMS_SENDER_VERIFIED:'true',TELNYX_MESSAGING_PROFILE_ID:crypto.randomUUID(),TELNYX_API_KEY:'fixture-no-provider-network',TELNYX_PHONE_NUMBER:'+12025550101'});
  const providerPrefix='phase6-sms-'+crypto.randomUUID()+'-';let posts=0;const transport:typeof fetch=async(url,init)=>{assert.equal(String(url),'https://api.telnyx.com/v2/messages');const body=JSON.parse(String(init?.body));assert.equal(body.to,c.body.caller_id);assert.equal(body.messaging_profile_id,process.env.TELNYX_MESSAGING_PROFILE_ID);assert.match(body.text,new RegExp('#'+a.orderNumber));posts++;return Response.json({data:{id:providerPrefix+posts}});};
  await runNotificationJobs(a.orderId,transport,sql);await runNotificationJobs(a.orderId,transport,sql);assert.equal(posts,1);
  const event={data:{id:'receipt-'+crypto.randomUUID(),event_type:'message.finalized',occurred_at:new Date().toISOString(),payload:{id:providerPrefix+'1',to:[{status:'delivered'}]}}};
  const keys=crypto.generateKeyPairSync('ed25519');process.env.TELNYX_PUBLIC_KEY=keys.publicKey.export({format:'pem',type:'spki'}).toString();
  const raw=JSON.stringify(event),timestamp=String(Math.floor(Date.now()/1000)),signature=crypto.sign(null,Buffer.from(timestamp+'|'+raw),keys.privateKey).toString('base64');
  const callback=(sig=signature,time=timestamp)=>new Request('https://cafe.fixture.test/api/telnyx/messaging',{method:'POST',headers:{'telnyx-signature-ed25519':sig,'telnyx-timestamp':time},body:raw});
  assert.equal((await messagingRoute(callback('invalid'))).status,401);assert.equal((await messagingRoute(callback(signature,'1'))).status,401);
  assert.equal((await messagingRoute(callback())).status,200);assert.equal((await (await messagingRoute(callback())).json()).duplicate,true);
  assert.equal((await sql`SELECT status FROM notification_jobs WHERE order_id=${a.orderId} AND kind='confirmed'`)[0].status,'delivered');
  await updateOrderStatus(a.orderId,'preparing');await runNotificationJobs(a.orderId,transport,sql);assert.equal(posts,2);
  await updateOrderStatus(a.orderId,'ready');await applyMessagingEvent({data:{id:'stop-'+crypto.randomUUID(),event_type:'message.received',occurred_at:new Date().toISOString(),payload:{from:{phone_number:c.body.caller_id},to:[{phone_number:process.env.TELNYX_PHONE_NUMBER}],text:'STOP'}}});
  await runNotificationJobs(a.orderId,transport,sql);assert.equal(posts,2);assert.equal((await sql`SELECT status FROM notification_jobs WHERE order_id=${a.orderId} AND kind='ready'`)[0].status,'suppressed');
  await updateOrderStatus(a.orderId,'completed');await confirmCashPayment(a.orderId);assert.equal((await sql`SELECT payment_status FROM orders WHERE id=${a.orderId}`)[0].payment_status,'paid');
 });
 await t.test('definite rate limits retry within bounds; ambiguous responses never resend',async()=>{
  const save=async(caller:string)=>{const d=await make(caller),r:any=await d.tools({tool:'review_order'}),v=await exchangeCustomerReview(r.reviewCode);return confirmCustomerReview(v.cookie,{...input,csrf:v.csrf});};
  const r=await save('+12025550125');let attempts=0;
  const limited:typeof fetch=async()=>{attempts++;return Response.json({errors:[{code:'rate_limit'}]},{status:429});};
  for(let i=0;i<5;i++){await sql`UPDATE notification_jobs SET next_attempt_at=now() WHERE order_id=${r.orderId}`;await runNotificationJobs(r.orderId,limited,sql);}
  assert.equal(attempts,3);assert.equal((await sql`SELECT status FROM notification_jobs WHERE order_id=${r.orderId}`)[0].status,'failed');
  const u=await save('+12025550126');let unknown=0;const ambiguous:typeof fetch=async()=>{unknown++;return Response.json({error:'gateway failed'},{status:502});};
  await runNotificationJobs(u.orderId,ambiguous,sql);await runNotificationJobs(u.orderId,ambiguous,sql);assert.equal(unknown,1);assert.equal((await sql`SELECT status FROM notification_jobs WHERE order_id=${u.orderId}`)[0].status,'uncertain');
 });
 await t.test('cash stays unpaid even for a zero-total order until staff records collection',async()=>{
  const d=await make('+12025550128');await sql`UPDATE menu_items SET price_cents=0 WHERE id=${item}`;
  try{const r:any=await d.tools({tool:'review_order'}),v=await exchangeCustomerReview(r.reviewCode),o=await confirmCustomerReview(v.cookie,{...input,csrf:v.csrf,channel:'none',consent:false});assert.equal(o.totalCents,0);assert.equal(o.paymentStatus,'unpaid');assert.equal((await sql`SELECT payment_status FROM orders WHERE id=${o.orderId}`)[0].payment_status,'unpaid');}
  finally{await sql`UPDATE menu_items SET price_cents=1000 WHERE id=${item}`;}
 });
 await t.test('ready-call fallback uses saved order, one submission and authenticated status callback',async()=>{
  const d=await make('+12025550127'),r:any=await d.tools({tool:'review_order'}),v=await exchangeCustomerReview(r.reviewCode),o=await confirmCustomerReview(v.cookie,{...input,csrf:v.csrf,channel:'call'});
  await updateOrderStatus(o.orderId,'preparing');await updateOrderStatus(o.orderId,'ready');Object.assign(process.env,{OUTBOUND_UPDATES_ENABLED:'true',TELNYX_TEXML_APPLICATION_ID:'fixture-app'});
  const providerId='phase6-ready-'+crypto.randomUUID();let posts=0,callback='';const transport:typeof fetch=async(url,init)=>{posts++;assert.match(String(url),/texml\/calls\/fixture-app$/);const b=JSON.parse(String(init?.body));assert.match(b.Texml,new RegExp(o.orderNumber));assert.match(b.Texml,/Polly.Joanna-Neural/);callback=b.StatusCallback;return Response.json({call_sid:providerId});};
  await runNotificationJobs(o.orderId,transport,sql);await runNotificationJobs(o.orderId,transport,sql);assert.equal(posts,1);
  const keys=crypto.generateKeyPairSync('ed25519');process.env.TELNYX_PUBLIC_KEY=keys.publicKey.export({format:'pem',type:'spki'}).toString();
  const raw='CallSid='+providerId+'&CallStatus=completed',timestamp=String(Math.floor(Date.now()/1000)),signature=crypto.sign(null,Buffer.from(timestamp+'|'+raw),keys.privateKey).toString('base64');
  const request=(url:string,sig=signature)=>new Request(url,{method:'POST',headers:{'telnyx-signature-ed25519':sig,'telnyx-timestamp':timestamp},body:raw});
  assert.equal((await callStatusRoute(request(callback,'bad'))).status,401);const forged=new URL(callback);forged.searchParams.set('token','forged');assert.equal((await callStatusRoute(request(forged.toString()))).status,401);
  assert.equal((await callStatusRoute(request(callback))).status,200);assert.equal((await sql`SELECT status FROM notification_jobs WHERE order_id=${o.orderId}`)[0].status,'delivered');process.env.OUTBOUND_UPDATES_ENABLED='false';
 });
});
