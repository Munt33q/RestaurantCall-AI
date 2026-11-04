// Reconstructed shared contracts only. Historical managed SIP transport is unavailable.
import test from 'node:test';import assert from 'node:assert/strict';import {initialState,decideTurn} from '../lib/voice-engine';
test('shared checkout starts without prior customer consent or payment authority',()=>{const s=initialState();assert.equal(s.phase,'ordering');assert.deepEqual(s.items,[]);assert.equal(s.paymentMethod,null);assert.ok(!s.notificationConsent);assert.ok(!s.relayReviewReady);});
test('shared quiet-call handling stops after bounded attempts without submission',()=>{let s=initialState();for(let i=0;i<3;i++){const r=decideTurn(s,'',[],0);s=r.state;assert.equal(r.submit,false);assert.equal(r.endCall,i===2);}});
