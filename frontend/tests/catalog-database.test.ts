// Reconstructed tenant/version/catalog atomicity contracts.
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {databaseEnabled,fixture} from './helpers/postgres';import {saveCatalogItem,savePromotion,listStaffCatalog} from '../lib/catalog-store';import {publishCatalog,stagePetra} from '../lib/catalog-import';import {openVoiceSession,insertOrder} from '../lib/repository';
test('catalog enforces tenant/version/audit, quote rollback, reviewed archive and free-order semantics',{skip:!databaseEnabled},async t=>{
 const {sql,item,restaurant}=await fixture(t);const input={name:'Classic Burger',category:'Mains',priceCents:1200,stockQty:10,itemNumber:1};
 const first=(await listStaffCatalog())[0];const changed=await saveCatalogItem(input,item,first.version);assert.equal(changed.version,first.version+1);
 await assert.rejects(()=>saveCatalogItem({...input,priceCents:1},item,first.version),/STALE/);
 const foreign=crypto.randomUUID();await sql`INSERT INTO restaurants(id,name) VALUES(${foreign},'Foreign synthetic')`;const other=crypto.randomUUID();await sql`INSERT INTO menu_items(id,restaurant_id,name,category,price_cents) VALUES(${other},${foreign},'Foreign item','Other',100)`;
 await assert.rejects(()=>saveCatalogItem(input,other,1),/Not found/);await assert.rejects(()=>savePromotion({title:'Foreign scope',kind:'fixed',value:1,itemIds:[other]}),/Invalid promotion scope/);
 const call='catalog-'+crypto.randomUUID();await openVoiceSession(call,'+12025550123','https://fixture.test');const [s]=await sql`SELECT id FROM call_sessions WHERE provider_call_id=${call}`;
 const orderInput={sessionId:s.id,customerName:'Fixture',paymentMethod:'cash' as const,items:[{menuItemId:item,quantity:1}]};
 await assert.rejects(()=>sql.begin(tx=>insertOrder(tx,{...orderInput,expectedQuote:{subtotalCents:1,discountCents:0,taxableSubtotalCents:1,taxCents:0,totalCents:1,promotionId:null}})),/QUOTE_CHANGED/);
 const [stock]=await sql`SELECT stock_qty FROM menu_items WHERE id=${item}`;assert.equal(stock.stock_qty,10);
 await savePromotion({title:'Free',kind:'percent',value:10000,itemIds:[item]});const free=await sql.begin(tx=>insertOrder(tx,{...orderInput,paymentMethod:'stripe'}));assert.equal(free.total_cents,0);assert.equal(free.payment_status,'paid');assert.equal(free.status,'confirmed');
 const [payment]=await sql`SELECT count(*)::int AS n FROM payment_jobs WHERE order_id=${free.id}`;assert.equal(payment.n,0);
 const draft=await stagePetra();await assert.rejects(()=>publishCatalog(draft.id,draft.version,[input],false,true),/Review/);const published=await publishCatalog(draft.id,draft.version,[{...input,name:'Replacement',itemNumber:1}],true,true);assert.equal(published.numbersAssignedFrom,2);
 const rows=await listStaffCatalog();assert.equal(rows.find((m:any)=>m.id===item)?.archived,true);assert.equal(rows.find((m:any)=>m.name==='Replacement')?.itemNumber,2);
 const [audit]=await sql`SELECT count(*)::int AS n FROM catalog_audit WHERE restaurant_id=${restaurant}`;assert.ok(audit.n>=3);
});
