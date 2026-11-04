import test from 'node:test';
import assert from 'node:assert/strict';
import {decideTurn,initialState} from '../lib/voice-engine';
const menu=[
{id:'beef',name:'Classic Burger',category:'Mains',itemNumber:1,priceCents:1299,isAvailable:true,stockQty:10},
{id:'chicken',name:'Chicken Burger',category:'Mains',itemNumber:5,priceCents:1199,isAvailable:false,stockQty:0},
{id:'cola',name:'Cola',category:'Drinks',itemNumber:10,priceCents:249,isAvailable:true,stockQty:10},
{id:'lemonade',name:'Lemonade',category:'Drinks',itemNumber:11,priceCents:299,isAvailable:true,stockQty:10},
{id:'shake',name:'Vanilla Shake',category:'Drinks',itemNumber:4,priceCents:599,isAvailable:true,stockQty:10},
];
test('burger availability question lists available burgers without adding one',()=>{
 const r=decideTurn(initialState(),'do u burgers',menu,825);assert.match(r.reply,/Classic Burger/);assert.match(r.reply,/yes/i);assert.deepEqual(r.state.items,[]);
});
test('specific drink questions answer availability without changing an existing cart',()=>{
 const state={...initialState(),items:[{menuItemId:'beef',quantity:1}]};
 const r=decideTurn(state,'do you have cola',menu,825);assert.match(r.reply,/yes.*Cola/i);assert.deepEqual(r.state.items,state.items);
});
test('missing brand is not falsely equated with a generic drink',()=>{
 const r=decideTurn(initialState(),'do you have Pepsi',menu,825);assert.match(r.reply,/do not carry Pepsi/i);assert.match(r.reply,/Cola/);assert.doesNotMatch(r.reply,/Vanilla Shake/);assert.deepEqual(r.state.items,[]);
});
test('sold-out items get an in-stock alternative rather than a substitution',()=>{
 const r=decideTurn(initialState(),'is the chicken burger available',menu,825);assert.match(r.reply,/currently unavailable/i);assert.match(r.reply,/Classic Burger/);assert.deepEqual(r.state.items,[]);
});
test('similar drink suggestions prefer the same kind of drink',()=>{
 const r=decideTurn(initialState(),'do you have chocolate shakes',menu,825);assert.match(r.reply,/Vanilla Shake/);assert.doesNotMatch(r.reply,/Classic Burger|Cola/);assert.deepEqual(r.state.items,[]);
});
test('ordering phrases still add items, while questions during name collection preserve the phase',()=>{
 assert.equal(decideTurn(initialState(),'can I get a cola',menu,825).state.items[0].menuItemId,'cola');
 const state={...initialState(),phase:'name' as const};const r=decideTurn(state,'do you have cola',menu,825);assert.equal(r.state.phase,'name');assert.equal(r.state.customerName,'');
});
test('what burgers do you have lists burger options rather than denying the question',()=>{
 const r=decideTurn(initialState(),'what burgers do you have',menu,825);assert.match(r.reply,/yes.*Classic Burger/i);assert.deepEqual(r.state.items,[]);
});
test('yes to a single offered item adds it, while yes to multiple choices asks which',()=>{
 const offer=decideTurn(initialState(),'do you have cola',menu,825);const accepted=decideTurn(offer.state,'yes please',menu,825);assert.deepEqual(accepted.state.items,[{menuItemId:'cola',quantity:1}]);assert.equal(accepted.submit,false);
 const alternatives=decideTurn(initialState(),'do you have drinks',menu,825);const unclear=decideTurn(alternatives.state,'yes',menu,825);assert.deepEqual(unclear.state.items,[]);assert.match(unclear.reply,/which/i);
});
