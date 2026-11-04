// Reconstructed shared language contract, not a managed SIP runtime test.
import test from 'node:test';import assert from 'node:assert/strict';import {normalizeCheckoutLanguage} from '../lib/customer-languages';import {initialState} from '../lib/voice-engine';
test('explicit multilingual confirmation is phase bound and never substring matched',()=>{
 for(const phrase of ['confirmar pedido','أكد الطلب','ऑर्डर की पुष्टि करें']){assert.equal(normalizeCheckoutLanguage(phrase,{...initialState(),phase:'confirm'}),'confirm');assert.equal(normalizeCheckoutLanguage(phrase,initialState()),phrase);assert.notEqual(normalizeCheckoutLanguage('not '+phrase,{...initialState(),phase:'confirm'}),'confirm');}
});
test('native payment and no-notes choices normalize only in their relevant phase',()=>{assert.equal(normalizeCheckoutLanguage('نقداً',{...initialState(),phase:'payment'}),'cash');assert.equal(normalizeCheckoutLanguage('कोई नोट नहीं',{...initialState(),phase:'notes'}),'no notes');assert.equal(normalizeCheckoutLanguage('نقداً',initialState()),'نقداً');});
