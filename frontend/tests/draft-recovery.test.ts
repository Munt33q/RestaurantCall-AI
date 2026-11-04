// Reconstructed from blueprint recovery authorization contracts.
import test from 'node:test';import assert from 'node:assert/strict';
import {credentialHash,sealCredential,openCredential,recoveryGate,freshRecoveryState,recoverySmsGate} from '../lib/engagement/recovery-contract';
import {recoveryCode,recoveryConsent} from '../lib/engagement/recovery-store';import {initialState} from '../lib/voice-engine';
test('credentials are authenticated, purpose separated and attempt/expiry bound',()=>{
 const key='fixture-only-secret-with-at-least-32-characters',sealed=sealCredential('token',key);
 assert.equal(openCredential(sealed,key),'token');assert.throws(()=>openCredential(sealed+'a',key));assert.throws(()=>sealCredential('token','short'));
 assert.notEqual(credentialHash('same',key,'token'),credentialHash('same',key,'code'));
 const grant={expiresAt:2000,claimed:false,committed:false,callerHash:'caller',expectedHash:'caller',failures:0};assert.equal(recoveryGate(grant,1000),null);
 for(const x of [{expiresAt:1000},{failures:5},{claimed:true},{committed:true},{expectedHash:'other'}])assert.ok(recoveryGate({...grant,...x},1000));
});
test('native numeral recovery codes require exact eight digits and separate consent',()=>{
 assert.equal(recoveryCode('resume ١٢٣٤ ٥٦٧٨'),'12345678');assert.equal(recoveryCode('recover १२३४-५६७८'),'12345678');
 assert.equal(recoveryCode('123456789'),null);assert.equal(recoveryCode('order 12345678'),null);
 assert.equal(recoveryConsent('yes'),null);assert.equal(recoveryConsent('send me a recovery text'),true);assert.equal(recoveryConsent('no recovery texts'),false);
});
test('restored draft revalidates stock and clears payment, consent and review',()=>{
 const old={...initialState(),phase:'confirm' as const,items:[{menuItemId:'a',quantity:5},{menuItemId:'gone',quantity:1}],paymentMethod:'stripe' as const,notificationConsent:true,relayReviewReady:true};
 const r=freshRecoveryState(old,[{id:'a',name:'Fixture',priceCents:100,itemNumber:1,isAvailable:true,stockQty:2}]);assert.equal(r.changed,true);assert.deepEqual(r.state.items,[{menuItemId:'a',quantity:2}]);assert.equal(r.state.phase,'ordering');assert.equal(r.state.paymentMethod,null);assert.ok(!r.state.notificationConsent);assert.ok(!r.state.relayReviewReady);
});
test('recovery SMS requires every consent/registration flag and enforces daily cap',()=>{
 const g={consent:true,smsEnabled:true,registered:true,recoveryEnabled:true,optedOut:false,phone:'+12025550123',sentToday:0,expired:false,claimed:false,committed:false};assert.equal(recoverySmsGate(g),null);
 for(const x of [{consent:false},{registered:false},{smsEnabled:false},{recoveryEnabled:false},{optedOut:true},{sentToday:1},{expired:true},{claimed:true},{committed:true}])assert.ok(recoverySmsGate({...g,...x}));
});
