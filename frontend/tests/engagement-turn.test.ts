// Reconstructed from blueprint app-speech engagement contracts.
import test from 'node:test';import assert from 'node:assert/strict';import {engagementTurn} from '../lib/engagement/turn';import {initialState} from '../lib/voice-engine';
const menu=[{id:'a',name:'Burger',category:'Mains',priceCents:1000,itemNumber:1,isAvailable:true,stockQty:3},{id:'b',name:'Fries',category:'Sides',priceCents:300,itemNumber:2,isAvailable:true,stockQty:1}];
const options={appSpeech:true,assistance:true,upsell:true,turn:0};
test('decline and hesitant filler never change the cart; offered events have durable keys',()=>{
 const r=engagementTurn(initialState(),'item 1',menu,0,options);assert.ok(r.engagementEvents.some(e=>e.kind==='upsell_offered'&&e.key==='turn:0'));
 const no=engagementTurn(r.state,'no thanks',menu,0,{...options,turn:1});assert.deepEqual(no.state.items,r.state.items);assert.ok(no.state.engagement?.upsell.declined);
 const uh=engagementTurn(no.state,'um',menu,0,{...options,turn:2});assert.deepEqual(uh.state.items,no.state.items);
});
test('offer acceptance checks current stock; disabled flags do not create offers',()=>{
 const r=engagementTurn(initialState(),'item 1',menu,0,options);
 const yes=engagementTurn(r.state,'yes',menu.map(m=>m.id==='b'?{...m,stockQty:0}:m),0,{...options,turn:1});assert.equal(yes.state.items.some(l=>l.menuItemId==='b'),false);
 const off=engagementTurn(initialState(),'item 1',menu,0,{...options,assistance:false,upsell:false});assert.equal(off.state.engagement,undefined);assert.equal(off.engagementEvents.length,0);
});
