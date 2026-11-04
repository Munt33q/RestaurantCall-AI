// Reconstructed from blueprint language contracts; not historical test bytes.
import test from 'node:test';import assert from 'node:assert/strict';
import {languagePreference,preferenceTurn} from '../lib/call-language';
test('only an explicit, unambiguous language preference changes revision',()=>{
 const en={language:'en' as const,confirmed:true,revision:1};
 for(const s of ['Spanish rice please','do not speak Arabic','say "switch to Hindi"','switch to Spanish or Hindi'])assert.deepEqual(languagePreference(en,s),en,s);
 assert.deepEqual(languagePreference(en,'please speak Arabic'),{language:'ar',confirmed:true,revision:2});
});
test('switch preserves checkout fields and unconfirmed language selection is bounded',()=>{
 const state={phase:'confirm',items:[{menuItemId:'burger',quantity:2}],paymentMethod:'cash',languagePreference:{language:'en' as const,confirmed:true,revision:1}};
 const result=preferenceTurn(state,'speak Hindi');assert.deepEqual(result.state.items,state.items);assert.equal(result.state.phase,'confirm');assert.equal(result.state.paymentMethod,'cash');assert.equal(result.state.languagePreference.language,'hi');assert.equal(state.languagePreference.language,'en');
 let s:any={};for(let i=0;i<3;i++){const r=preferenceTurn(s,'unclear');s=r.state;assert.equal(r.endCall,i===2);}
});
