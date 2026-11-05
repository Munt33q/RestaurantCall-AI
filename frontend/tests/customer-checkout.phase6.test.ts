import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {validateInitiation} from '../lib/elevenlabs-initiation';
import {callToolKey,equalSecret,boundedJson,verifyElevenLabsSignature} from '../lib/elevenlabs-security';
import {validateCustomerConfirmation,openReviewGrant,normalizeReviewCode,exchangeCustomerReview} from '../lib/customer-checkout';
import {customerOrigin} from '../lib/checkout-http';
import {smsDeliveryReady,notificationText} from '../lib/notification-contract';
import {POST as initiation} from '../app/api/elevenlabs/initiation/route';
import {POST as confirm} from '../app/api/checkout/confirm/route';

test('provider initiation rejects model identities, unknown agents/destinations and non-allowlisted preview callers',()=>{
 Object.assign(process.env,{ELEVENLABS_AGENT_ID:'agent_fixture',ELEVENLABS_INBOUND_NUMBER:'+12025550101',VERCEL_ENV:'preview',ELEVENLABS_ACCEPTANCE_CALLERS:'+12025550123'});
 const b={conversation_id:'conv_phase6fixture123',agent_id:'agent_fixture',caller_id:'+12025550123',called_number:'+12025550101',call_sid:'sip-fixture-id',call_id:'fixture@telnyx'};
 assert.deepEqual(validateInitiation(b),b);
 for(const p of [{agent_id:'other'},{called_number:'+12025550199'},{caller_id:'+12025550188'},{call_sid:''},{call_id:'bad\nheader'},{conversation_id:'model-generated'}])assert.throws(()=>validateInitiation({...b,...p}));
 delete process.env.VERCEL_ENV;
});
test('per-conversation tool credentials cannot authorize another conversation or call',()=>{
 process.env.ELEVENLABS_SESSION_BINDING_KEY='phase6-fixture-secret-more-than-32-characters';
 const a=callToolKey('conv_fixture123','provider-a');assert.equal(equalSecret(a,a),true);assert.equal(equalSecret(a,callToolKey('conv_fixture123','provider-b')),false);assert.equal(equalSecret(a,callToolKey('conv_fixture456','provider-a')),false);assert.equal(equalSecret('',a),false);assert.equal(equalSecret('short','short'),false);
});
test('ElevenLabs terminal webhooks require raw-body HMAC and a fresh unique timestamp',()=>{
 const key=crypto.randomBytes(32).toString('hex'),raw='{"type":"post_call_transcription"}',timestamp=String(Math.floor(Date.now()/1000));
 const signature='t='+timestamp+',v0='+crypto.createHmac('sha256',key).update(timestamp+'.'+raw).digest('hex');
 assert.equal(verifyElevenLabsSignature(raw,signature,key),true);
 for(const [body,header,secret] of [[raw+' ',signature,key],[raw,signature,'different-key-more-than-thirty-two-characters'],[raw,signature+',t='+timestamp,key],[raw,signature.replace(timestamp,'1000000000'),key],[raw,signature,undefined]])assert.equal(verifyElevenLabsSignature(body!,header!,secret),false);
});
test('bounded request reader rejects streamed oversized bodies before using provider input',async()=>{
 await assert.rejects(()=>boundedJson(new Request('https://fixture.test',{method:'POST',body:'x'.repeat(5000)})),/too large/);
 await assert.rejects(()=>boundedJson(new Request('https://fixture.test',{method:'POST',body:'bad JSON'})),SyntaxError);
});
test('customer confirmation requires explicit complete review and name confirmation; model fields are refused',()=>{
 const b={csrf:'browser-csrf',reviewAccepted:true,nameConfirmed:true,channel:'none',consent:false};assert.deepEqual(validateCustomerConfirmation(b),b);
 for(const p of [{reviewAccepted:false},{nameConfirmed:false},{channel:'sms',consent:false},{channel:'call',consent:false},{restaurant_id:'forged'},{paymentMethod:'stripe'},{totalCents:1}])assert.throws(()=>validateCustomerConfirmation({...b,...p}));
 assert.throws(()=>openReviewGrant('forged'));assert.equal(normalizeReviewCode('AABB-CCDD EEFF'),'aabbccddeeff');
});
test('customer checkout rejects cross-site requests, missing browser origins and wrong content types',()=>{
 const req=(headers:Record<string,string>)=>new Request('https://cafe.test/api/checkout/confirm',{method:'POST',headers});
 customerOrigin(req({origin:'https://cafe.test','content-type':'application/json'}));
 for(const h of [{origin:'https://attacker.test','content-type':'application/json'},{'content-type':'application/json'},{origin:'https://cafe.test','content-type':'text/plain'},{origin:'https://cafe.test','content-type':'application/json','sec-fetch-site':'cross-site'}])assert.throws(()=>customerOrigin(req(h)));
});
test('checkout and provider initiation default to disabled; no database or provider request is possible',async()=>{
 delete process.env.ELEVENLABS_CHECKOUT_ENABLED;delete process.env.RESTAURANT_ORDERING_ENABLED;delete process.env.ELEVENLABS_SESSION_BINDING_ENABLED;
 await assert.rejects(()=>exchangeCustomerReview('ab'.repeat(10)),/activation/);
 assert.equal((await initiation(new Request('https://fixture.test',{method:'POST'}))).status,503);
 assert.equal((await confirm(new Request('https://fixture.test/api/checkout/confirm',{method:'POST',headers:{origin:'https://attacker.test','content-type':'application/json'},body:'{}'}))).status,403);
});
test('SMS requires all registration, sender and profile gates; templates use saved references and cash total',()=>{
 Object.assign(process.env,{SMS_DELIVERY_ENABLED:'true',SMS_REGISTRATION_VERIFIED:'true',SMS_SENDER_VERIFIED:'true',TELNYX_MESSAGING_PROFILE_ID:'00000000-0000-4000-8000-000000000001'});assert.equal(smsDeliveryReady(),true);
 for(const k of ['SMS_DELIVERY_ENABLED','SMS_REGISTRATION_VERIFIED','SMS_SENDER_VERIFIED','TELNYX_MESSAGING_PROFILE_ID']){const old=process.env[k];delete process.env[k];assert.equal(smsDeliveryReady(),false);process.env[k]=old;}
 const order={id:'12345678-1234',status:'confirmed',customer_name:'Alex',restaurant_name:'Petra Cafe',payment_method:'cash',total_cents:1407};
 assert.equal(notificationText(order,'confirmed'),'Petra Cafe: Hi Alex, your order #12345678 has been received. Total: $14.07. Pay at pickup. Reply STOP to opt out.');
 assert.match(notificationText(order,'preparing'),/Petra Cafe.*#12345678.*being prepared/);assert.match(notificationText(order,'ready'),/Petra Cafe.*#12345678.*ready for pickup/);
});
