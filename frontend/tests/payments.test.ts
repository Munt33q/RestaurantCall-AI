import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentDecision } from '../lib/payment-contract';
const order={id:'o1',totalCents:3352,status:'awaiting_payment',paymentStatus:'pending',checkoutSessionId:'cs_1'};
test('paid checkout must match order, session, amount and currency',()=>{
 const session={id:'cs_1',metadata:{orderId:'o1'},amount_total:3352,currency:'usd',payment_status:'paid'};
 assert.equal(paymentDecision('checkout.session.completed',session,order),'paid');
 assert.equal(paymentDecision('checkout.session.completed',{...session,amount_total:1},order),'ignore');
 assert.equal(paymentDecision('checkout.session.completed',{...session,currency:'eur'},order),'ignore');
 assert.equal(paymentDecision('checkout.session.completed',{...session,payment_status:'unpaid'},order),'ignore');
 assert.equal(paymentDecision('checkout.session.completed',{...session,id:'cs_other'},order),'ignore');
});
test('expiry releases reservation once, late events do not revive cancellation',()=>{
 const session={id:'cs_1',metadata:{orderId:'o1'},amount_total:3352,currency:'usd',payment_status:'unpaid'};
 assert.equal(paymentDecision('checkout.session.expired',session,order),'expired');
 assert.equal(paymentDecision('checkout.session.expired',session,{...order,paymentStatus:'paid'}),'ignore');
 assert.equal(paymentDecision('checkout.session.completed',{...session,payment_status:'paid'},{...order,status:'cancelled'}),'ignore');
});
import {checkoutPolicy} from '../lib/payment-contract';
test('unprovisioned card orders expire instead of permanently holding stock',()=>{
 const created=new Date('2026-11-01T12:00:00Z');
 assert.equal(checkoutPolicy(created,new Date('2026-11-01T12:01:00Z')),'create');
 assert.equal(checkoutPolicy(created,new Date('2026-11-01T12:31:00Z')),'expire');
});
