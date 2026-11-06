import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {issueVoiceReview,placeVoiceOrder} from '../lib/elevenlabs-order';
import {validateTool} from '../lib/elevenlabs-tools';
import {migrationFiles} from '../scripts/migration-profile.mjs';

test('direct voice checkout uses actual PostgreSQL pricing, stale review rejection and atomic order insertion',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 for(const file of migrationFiles(readdirSync('drizzle'),{directVoice:true}))await db.exec(readFileSync('drizzle/'+file,'utf8').replace(/CREATE EXTENSION[^;]*;/gi,''));
 assert.equal((await db.query("SELECT to_regclass('public.telephone_checkouts') AS relation")).rows[0].relation,null);
 let connection:any=db;
 const tx:any=async(strings:TemplateStringsArray,...values:any[])=>{
  const text=strings.reduce((s,x,i)=>s+(i?'$'+i:'')+x,'');
  return (await connection.query(text,values)).rows;
 };tx.json=(x:any)=>JSON.stringify(x);
 const rid=randomUUID(),sid=randomUUID(),item=randomUUID();
 Object.assign(process.env,{RESTAURANT_ID:rid,RESTAURANT_ORDERING_ENABLED:'true',ELEVENLABS_DIRECT_ORDERING_ENABLED:'true',CASH_ONLY_CHECKOUT_ENABLED:'true'});
 await tx`INSERT INTO restaurants(id,name,tax_rate_bps) VALUES(${rid},'Voice test restaurant',825)`;
 await tx`INSERT INTO menu_items(id,restaurant_id,name,category,price_cents,stock_qty,item_number) VALUES(${item},${rid},'Test Burger','Mains',1000,10,1)`;
 await tx`INSERT INTO call_sessions(id,restaurant_id,provider_call_id,caller_phone,elevenlabs_conversation_id,elevenlabs_binding_source,expires_at) VALUES(${sid},${rid},${'test-'+sid},'+12025550123',${'conv_'+sid.replaceAll('-','')},'provider_initiation',now()+interval '30 minutes')`;
 const [session]=await tx`SELECT * FROM call_sessions WHERE id=${sid}`;
 const state={items:[{menuItemId:item,quantity:2}],customerName:'Alex',nameConfirmed:true,notesCollected:true,notes:'No onions'};
 await tx`INSERT INTO draft_carts(session_id,state_json) VALUES(${sid},${tx.json(state)})`;
 const draft=async()=> (await tx`SELECT * FROM draft_carts WHERE session_id=${sid}`)[0];
 await t.test('confirmation and fresh review are mandatory; arbitrary prices are rejected',async()=>{
  await assert.rejects(()=>placeVoiceOrder(tx,session,awaitedDraft(),{customer_confirmed:true}),/./);
  assert.throws(()=>validateTool({tool:'place_order',conversation_id:session.elevenlabs_conversation_id,customer_confirmed:true,totalCents:1}),/Unknown/);
  assert.throws(()=>validateTool({tool:'place_order',conversation_id:session.elevenlabs_conversation_id,customer_confirmed:'true'}),/boolean/);
 });
 function awaitedDraft(){return {state_json:state,version:1};}
 let review=await issueVoiceReview(tx,session,await draft());
 assert.equal(review.review.quote.totalCents,2165);
 await assert.rejects(()=>placeVoiceOrder(tx,session,awaitedDraft(),{customer_confirmed:false,review_id:review.review_id}),/confirmation/);
 await t.test('version, expiry, provider identity and changed menu price reject submission',async()=>{
  const d=await draft();
  await assert.rejects(()=>placeVoiceOrder(tx,session,{...d,version:d.version+1},{customer_confirmed:true,review_id:review.review_id}),/changed/);
  await assert.rejects(()=>placeVoiceOrder(tx,session,{...d,state_json:{...d.state_json,voiceReview:{...d.state_json.voiceReview,expiresAt:0}}},{customer_confirmed:true,review_id:review.review_id}),/expired/);
  await assert.rejects(()=>placeVoiceOrder(tx,{...session,elevenlabs_binding_source:'legacy'},d,{customer_confirmed:true,review_id:review.review_id}),/Provider/);
  await tx`UPDATE menu_items SET price_cents=1100 WHERE id=${item}`;
  await assert.rejects(()=>placeVoiceOrder(tx,session,d,{customer_confirmed:true,review_id:review.review_id}),/pricing changed/);
  assert.equal((await tx`SELECT count(*)::int AS n FROM orders`)[0].n,0);
  assert.equal((await tx`SELECT stock_qty FROM menu_items WHERE id=${item}`)[0].stock_qty,10);
 });
 await tx`INSERT INTO promotions(restaurant_id,title,kind,value,categories) VALUES(${rid},'Mains deal','percent',2000,'["Mains"]')`;
 review=await issueVoiceReview(tx,session,await draft());
 assert.equal(review.review.quote.discountCents,440);
 const result=await db.transaction(async conn=>{connection=conn;try{return await placeVoiceOrder(tx,session,await draft(),{customer_confirmed:true,review_id:review.review_id});}finally{connection=db;}});
 assert.equal(result.totalCents,1905);assert.equal(result.paymentStatus,'unpaid');
 const [order]=await tx`SELECT * FROM orders WHERE id=${result.orderId}`;
 assert.equal(result.orderNumber,order.id.slice(0,8));assert.equal(order.discount_cents,440);assert.equal(order.total_cents,1905);assert.equal(order.payment_method,'cash');assert.equal(order.notification_channel,'none');
 const [line]=await tx`SELECT * FROM order_items WHERE order_id=${order.id}`;
 assert.equal(line.item_name,'Test Burger');assert.equal(line.quantity,2);assert.equal(line.unit_price_cents,1100);
 assert.equal((await tx`SELECT stock_qty FROM menu_items WHERE id=${item}`)[0].stock_qty,8);
 assert.equal((await tx`SELECT count(*)::int AS n FROM payment_jobs`)[0].n,0);
 assert.equal((await tx`SELECT count(*)::int AS n FROM notification_jobs`)[0].n,0);
});
