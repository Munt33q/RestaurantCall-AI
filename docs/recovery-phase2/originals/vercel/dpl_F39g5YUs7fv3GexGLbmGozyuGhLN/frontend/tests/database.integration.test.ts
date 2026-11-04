import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {client} from '../lib/db/client';
import {openVoiceSession,processVoiceTurn,listOrders,updateOrderStatus,applyStripeEvent} from '../lib/repository';
import {runPaymentJobs} from '../lib/payments';
import type Stripe from 'stripe';

test('database: concurrent callbacks, kitchen contract, payment and expiry lifecycle',{skip:!process.env.DATABASE_URL},async()=>{
 const sql=client();
 try{
 const restaurant=crypto.randomUUID();process.env.RESTAURANT_ID=restaurant;
 await sql`INSERT INTO restaurants(id,name,tax_rate_bps) VALUES(${restaurant},'Integration test restaurant',825)`;
 const item=crypto.randomUUID();await sql`INSERT INTO menu_items(id,restaurant_id,name,category,price_cents,stock_qty,item_number) VALUES(${item},${restaurant},'Classic Burger','Mains',1299,20,1)`;
 const base='https://example.test';
 async function call(payment='cash'){
  const id='test-'+crypto.randomUUID();await openVoiceSession(id,'+15555550123',base);
  let turn=0;
  for(const speech of ['two burgers',"that's all",'Test Customer','yes',payment,...(payment==='card'?['no']:[]),'none'])await processVoiceTurn({providerCallId:id,speech,turn:turn++,base});
  return {id,turn};
 }
 const cash=await call();
 const replies=await Promise.all([1,2,3].map(()=>processVoiceTurn({providerCallId:cash.id,speech:'confirm',turn:cash.turn,base})));
 assert.equal(new Set(replies.map(r=>r.xml)).size,1);
 let board=await listOrders();assert.equal(board.length,1);assert.equal(board[0].items[0].quantity,2);assert.equal(board[0].customerName,'Test Customer');assert.equal(board[0].totalCents,2812);
 await assert.rejects(()=>updateOrderStatus(board[0].id,'completed'));
 await updateOrderStatus(board[0].id,'preparing');await updateOrderStatus(board[0].id,'ready');await updateOrderStatus(board[0].id,'completed');
 const [stock]=await sql`SELECT stock_qty FROM menu_items WHERE id=${item}`;assert.equal(stock.stock_qty,18);
 const card=await call('card');await processVoiceTurn({providerCallId:card.id,speech:'confirm',turn:card.turn,base});
 board=await listOrders();const pending=board.find(o=>o.paymentMethod==='stripe')!;
 assert.equal(pending.status,'awaiting_payment');await assert.rejects(()=>updateOrderStatus(pending.id,'preparing'));
 // Missing provider credentials preserve a retryable job, never a false paid status.
 delete process.env.STRIPE_SECRET_KEY;await runPaymentJobs(pending.id);
 const [job]=await sql`SELECT * FROM payment_jobs WHERE order_id=${pending.id}`;assert.equal(job.attempts,1);assert.ok(job.last_error);
 await sql`UPDATE orders SET checkout_session_id='cs_fixture' WHERE id=${pending.id}`;
 const event={id:'evt_'+crypto.randomUUID(),type:'checkout.session.completed',data:{object:{id:'cs_fixture',metadata:{orderId:pending.id},amount_total:pending.totalCents,currency:'usd',payment_status:'paid'}}} as unknown as Stripe.Event;
 await Promise.all([applyStripeEvent(event),applyStripeEvent(event)]);
 const paid=(await listOrders()).find(o=>o.id===pending.id)!;assert.equal(paid.paymentStatus,'paid');assert.equal(paid.status,'confirmed');await updateOrderStatus(paid.id,'preparing');
 const expired=await call('card');await processVoiceTurn({providerCallId:expired.id,speech:'confirm',turn:expired.turn,base});
 const last=(await listOrders()).find(o=>o.status==='awaiting_payment')!;await sql`UPDATE orders SET checkout_session_id='cs_expiry' WHERE id=${last.id}`;
 const expiry={id:'evt_'+crypto.randomUUID(),type:'checkout.session.expired',data:{object:{id:'cs_expiry',metadata:{orderId:last.id},amount_total:last.totalCents,currency:'usd',payment_status:'unpaid'}}} as unknown as Stripe.Event;
 await applyStripeEvent(expiry);await applyStripeEvent(expiry);
 const [after]=await sql`SELECT stock_qty FROM menu_items WHERE id=${item}`;assert.equal(after.stock_qty,16);
 assert.equal((await listOrders()).find(o=>o.id===last.id)!.status,'cancelled');
 }finally{await sql.end();}
});
