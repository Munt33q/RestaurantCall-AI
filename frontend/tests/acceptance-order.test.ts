// Reconstructed acceptance isolation contract. Synthetic disposable data only.
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {databaseEnabled,fixture} from './helpers/postgres';import {insertOrder,openVoiceSession,updateOrderStatus,listOrders} from '../lib/repository';import {confirmCashPayment,enqueueStatus,enqueuePaymentSms,runNotificationJobs} from '../lib/operations';import {saveRecoveryDraft} from '../lib/engagement/recovery-store';import {initialState} from '../lib/voice-engine';
test('acceptance card rejection and recovery rejection happen before any database access',async()=>{
 const never:any=()=>{throw Error('unexpected SQL');};await assert.rejects(()=>insertOrder(never,{sessionId:'x',customerName:'Fixture',paymentMethod:'stripe',items:[],isTest:true}),/ACCEPTANCE_CASH_ONLY/);
 await saveRecoveryDraft(never,{id:'x'},{...initialState(),isAcceptanceTest:true},'send me a recovery text');
});
test('acceptance orders force cash, no consent/jobs and visible DO NOT PREPARE marking',{skip:!databaseEnabled},async t=>{
 const {sql,item}=await fixture(t);const call='acceptance-'+crypto.randomUUID();await openVoiceSession(call,'+12025550123','https://fixture.test');const [session]=await sql`SELECT id FROM call_sessions WHERE provider_call_id=${call}`;
 const order=await sql.begin(tx=>insertOrder(tx,{sessionId:session.id,customerName:'Acceptance Fixture',paymentMethod:'cash',items:[{menuItemId:item,quantity:1}],isTest:true,notificationChannel:'sms',notificationConsent:true,paymentLinkSmsConsent:true}));
 assert.equal(order.is_test,true);assert.equal(order.notification_channel,'none');assert.equal(order.payment_sms_consent,false);assert.match(order.notes,/DO NOT PREPARE/);
 const [jobs]=await sql`SELECT count(*)::int AS n FROM notification_jobs WHERE order_id=${order.id}`;assert.equal(jobs.n,0);
 assert.equal((await listOrders())[0].isTest,true);await assert.rejects(()=>updateOrderStatus(order.id,'preparing'),/Invalid order transition/);await assert.rejects(()=>confirmCashPayment(order.id),/cannot be recorded/);
 // Even an erroneously consented test ticket must not enqueue or dispatch messages.
 await sql.begin(async tx=>{const malformed={...order,notification_channel:'sms',notification_consent_at:new Date(),payment_sms_consent:true,payment_sms_consent_at:new Date()};await enqueueStatus(tx,malformed);await enqueuePaymentSms(tx,malformed);});
 await sql`INSERT INTO notification_jobs(restaurant_id,order_id,event_key,kind,channel,consent_at) VALUES(${order.restaurant_id},${order.id},${'test-malformed-'+order.id},'confirmed','sms',now())`;
 let network=0;await runNotificationJobs(order.id,async()=>{network++;throw Error('never send');},sql);assert.equal(network,0);const [blocked]=await sql`SELECT status FROM notification_jobs WHERE order_id=${order.id}`;assert.equal(blocked.status,'suppressed');
});
