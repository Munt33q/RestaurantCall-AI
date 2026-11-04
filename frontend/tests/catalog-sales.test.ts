// Reconstructed from blueprint catalog and sales contracts.
import test from 'node:test';import assert from 'node:assert/strict';
import {validateCatalogItem,validatePromotion,promotionQuote,type Promotion} from '../lib/catalog-policy';
import {salesSummary} from '../lib/sales-context';import {callPrecontext} from '../lib/call-precontext';
test('catalog validates trusted fields, integer money and ordered date intervals',()=>{
 const item={name:'Fixture',category:'Sides',priceCents:100,stockQty:2};
 for(const x of [{priceCents:1.2},{stockQty:-1},{priceCents:NaN},{injected:'untrusted'},{specialStartsAt:'2026-02-02T00:00:00Z',specialEndsAt:'2026-01-01T00:00:00Z'}])assert.throws(()=>validateCatalogItem({...item,...x}));
 assert.throws(()=>validatePromotion({title:'Bad',kind:'percent',value:10001}));
});
test('discounts never stack, never discount unrelated items and expire at the boundary',()=>{
 const p:Promotion={id:'one',title:'Fixture',kind:'fixed',value:900,itemIds:['a'],active:true,startsAt:null,endsAt:'2026-01-02T00:00:00Z'};
 const lines=[{itemId:'a',priceCents:100,quantity:1},{itemId:'b',priceCents:500,quantity:1}];
 assert.equal(promotionQuote(lines,825,[p,{...p,id:'two'}],Date.parse('2026-01-01')).totalCents,541);
 assert.equal(promotionQuote(lines,825,[p],Date.parse(p.endsAt!)).discountCents,0);
});
test('precontext explicitly distinguishes unknown history and bounds trusted sales',()=>{
 const menu=Array.from({length:5},(_,i)=>({id:String(i),name:'Fixture'+i,priceCents:100,itemNumber:i,isAvailable:true,stockQty:i===0?0:2}));
 const summary=salesSummary(menu.map(m=>({menu_item_id:m.id,quantity:10})),menu);assert.doesNotMatch(summary,/Fixture0|Fixture4/);
 const text=callPrecontext('en',null,summary,[],'x\n'.repeat(500));assert.equal(text.split('\n').length,4);assert.match(text,/unknown/);assert.ok(text.length<900);
});
