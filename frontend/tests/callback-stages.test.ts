import test from 'node:test';import assert from 'node:assert/strict';import {callbackStages,callbackWanted,callbackMessage,callbackRetryLimit,previewCallbackAllowed} from '../lib/callback-policy';
import {notificationGate} from '../lib/notification-contract';
const base={id:'c0e3cb02-other',notification_channel:'call',notification_consent_at:new Date(),callback_stages:['accepted','ready'],restaurant_accepted_at:new Date()};
test('callbacks require separate acceptance/ready consent and never fire at submission; Ready and Completed share one readiness event',()=>{
 for(const stages of [[],['accepted'],['ready'],['accepted','ready']])for(const status of ['confirmed','preparing','ready','completed','cancelled']){
 const o={...base,status,callback_stages:stages};assert.equal(callbackWanted(o,'accepted'),stages.includes('accepted')&&status==='preparing');assert.equal(callbackWanted(o,'ready'),stages.includes('ready')&&['ready','completed'].includes(status));}
 assert.equal(callbackWanted({...base,status:'preparing',restaurant_accepted_at:null},'accepted'),false);
 assert.equal(callbackWanted({...base,status:'ready',notification_consent_at:null},'ready'),false);
 assert.deepEqual(callbackStages(['ready','accepted']),['accepted','ready']);assert.throws(()=>callbackStages(['completed']));assert.throws(()=>callbackStages(['ready','ready']));
});
test('messages distinguish restaurant acceptance from ready and contain only the saved order reference',()=>{
 assert.match(callbackMessage(base,'accepted','Fixture'),/restaurant has accepted/);assert.doesNotMatch(callbackMessage(base,'accepted','Fixture'),/ready for pickup/);assert.match(callbackMessage(base,'ready','Fixture'),/ready for pickup/);assert.match(callbackMessage(base,'ready','Fixture'),/c, 0, e, 3, c, b, 0, 2/);
 assert.equal(callbackRetryLimit('99'),2);assert.equal(callbackRetryLimit('1'),1);assert.equal(callbackRetryLimit('3'),3);
});
test('preview callback transport is confined to the approved caller',()=>{const old={...process.env};try{Object.assign(process.env,{VERCEL_ENV:'preview',ELEVENLABS_ACCEPTANCE_CALLERS:'+12025550123'});assert.equal(previewCallbackAllowed('+12025550123'),true);assert.equal(previewCallbackAllowed('+12025550124'),false);}finally{for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);}});
test('acceptance callbacks use the staff preparing transition, not customer confirmation',()=>{const args={channel:'call',consent:true,optedOut:false,smsEnabled:false,callsEnabled:true,phone:'+12025550123',kind:'accepted'};assert.equal(notificationGate({...args,orderStatus:'preparing'}),null);assert.match(notificationGate({...args,orderStatus:'confirmed'})!,/outdated/);});
