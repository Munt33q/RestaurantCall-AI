import test from 'node:test';import assert from 'node:assert/strict';
import {describeMenu} from '../lib/live-menu';import {menuDocument,syncConfig,providerRequest} from '../lib/menu-sync';
import {validatePromotion,promotionQuote,type Promotion} from '../lib/catalog-policy';
const now=Date.parse('2026-11-05T18:00:00Z');
const items=[{id:'burger',name:'Classic Burger',category:'Mains',description:'Beef',priceCents:1299,stockQty:2,itemNumber:1,isAvailable:true,aliases:[]},{id:'fries',name:'Fries',category:'Sides',description:'Potato',priceCents:499,stockQty:0,itemNumber:2,isAvailable:true,aliases:[]}];
const offer:Promotion={id:'sale',title:'20 percent',kind:'percent',value:2000,itemIds:[],categories:['Mains'],active:true,startsAt:null,endsAt:null};
test('live menu and categories use current integer prices, stock, one best offer and tax',()=>{
 const first=describeMenu(items,[offer],825,'mains',now);assert.equal(first.matches[0].quoteForOne.discountCents,259);assert.equal(first.matches[0].quoteForOne.taxCents,85);assert.equal(first.matches[0].quoteForOne.totalCents,1125);
 assert.equal(describeMenu([{...items[0],priceCents:1399}],[offer],825,'burger',now).matches[0].priceCents,1399);
 assert.equal(describeMenu(items,[offer],825,'sides',now).matches[0].isAvailable,false);
 assert.equal(describeMenu(items,[{...offer,endsAt:new Date(now).toISOString()}],825,'',now).offers.length,0);
 const lines=[{itemId:'burger',category:'Mains',priceCents:1299,quantity:1}];
 assert.equal(promotionQuote(lines,825,[offer,{...offer,id:'fixed',kind:'fixed',value:500}],now).discountCents,500);
 assert.equal(promotionQuote(lines,825,[{...offer,active:false}],now).discountCents,0);
 assert.deepEqual(validatePromotion({title:'Scope',kind:'fixed',value:100,categories:['Mains']}).categories,['Mains']);
});
test('menu knowledge document is stable, complete and contains no call or customer records',()=>{
 const data={restaurant:{id:'r',name:'Fixture',catalog_revision:2,tax_rate_bps:825},items:Array.from({length:120},(_,i)=>({...items[0],id:String(i)})),promotions:[offer]};
 const doc=menuDocument(data,now);assert.equal(JSON.parse(doc.content).items.length,120);assert.equal(doc.hash,menuDocument(data,now+1000).hash);assert.equal(doc.next,null);assert.doesNotMatch(doc.content,/caller_phone|customer_name|xi-api-key/);
 assert.notEqual(doc.hash,menuDocument({...data,items:[{...items[0],isAvailable:false}]},now).hash);
});
test('sync requires explicit preview mapping and never enables production by accident',()=>{
 const saved={...process.env};try{Object.assign(process.env,{ELEVENLABS_MENU_SYNC_ENABLED:'true',ELEVENLABS_AGENT_ID:'a',ELEVENLABS_STAGING_BRANCH_ID:'b',XI_API_KEY:'fixture',VERCEL_ENV:'preview'});assert.equal(syncConfig().enabled,true);process.env.VERCEL_ENV='production';delete process.env.ELEVENLABS_MENU_SYNC_PRODUCTION_APPROVED;assert.equal(syncConfig().enabled,false);}finally{for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
});
test('provider failures retain only a redacted status, never credentials or response body',async()=>{
 const old=global.fetch;global.fetch=async()=>new Response('sensitive provider diagnostics',{status:429});try{await assert.rejects(()=>providerRequest('knowledge-base/doc','PATCH','fixture-secret',{content:'menu'}),e=>e instanceof Error&&e.message==='ElevenLabs request failed (HTTP 429)');}finally{global.fetch=old;}
});
