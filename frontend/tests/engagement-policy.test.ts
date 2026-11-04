// Reconstructed from blueprint hesitation and upsell policy.
import test from 'node:test';import assert from 'node:assert/strict';
import {initialAssistance,observeAssistance} from '../lib/engagement/assistance';import {initialUpsell,authorizeUpsell,answerUpsell} from '../lib/engagement/upsell';
const menu=[{id:'a',name:'Burger',category:'Mains',priceCents:1000,itemNumber:1,isAvailable:true,stockQty:3},{id:'b',name:'Fries',category:'Sides',priceCents:300,itemNumber:2,isAvailable:true,stockQty:2},{id:'c',name:'Tea',category:'Drinks',priceCents:200,itemNumber:3,isAvailable:true,stockQty:null}];
test('assistance needs two uncertain turns or six seconds of proven idle and never interrupts',()=>{
 const event={id:1,now:10000,phase:'ordering',language:'en',finalText:'um',callerSpeaking:false,agentSpeaking:false,providerHealthy:true};const caps={appSpeech:true,playback:true};
 const one=observeAssistance(initialAssistance(),event,caps);assert.equal(one.cue,null);assert.ok(observeAssistance(one.state,{...event,id:2},caps).cue);
 for(const x of [{callerSpeaking:true},{agentSpeaking:true},{providerHealthy:false},{phase:'confirm'},{playbackEndedAt:5000}])assert.equal(observeAssistance(initialAssistance(),{...event,idle:true,playbackEndedAt:4000,...x},caps).cue,null);
 assert.ok(observeAssistance(initialAssistance(),{...event,idle:true,playbackEndedAt:4000},caps).cue);
});
test('upsells cap offers, avoid combos/declines and cannot accept an interrupted offer',()=>{
 const input={phase:'ordering',items:[{menuItemId:'a',quantity:1}],menu,requestId:'1',language:'en',appSpeech:true,hesitant:false,assisted:false,opportunity:'added' as const};
 const one=authorizeUpsell(initialUpsell(),input);assert.equal(one.offer?.itemId,'b');
 const accepted=answerUpsell(one.state,'yes');const two=authorizeUpsell(accepted.state,{...input,requestId:'2'});assert.equal(two.offer?.itemId,'c');
 assert.equal(authorizeUpsell(answerUpsell(two.state,'yes').state,{...input,requestId:'3'}).offer,null);
 assert.equal(answerUpsell({...one.state,pending:undefined,interrupted:one.offer!},'yes').acceptedItemId,null);
 assert.equal(authorizeUpsell(answerUpsell(one.state,'no').state,{...input,requestId:'2'}).offer,null);
 assert.equal(authorizeUpsell(initialUpsell(),{...input,menu:[{...menu[0],name:'Combo Meal'},...menu.slice(1)]}).offer,null);
});
