// Reconstructed dataset consistency test. Does not independently verify the original photos.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('recovered Petra photo catalog preserves 74 items, nine categories and documented prices',()=>{
 const data=JSON.parse(readFileSync(new URL('../data/petra-hattiesburg-photos.json',import.meta.url),'utf8'));const items=data.items;
 assert.equal(items.length,74);assert.equal(new Set(items.map((i:any)=>i.category)).size,9);
 assert.equal(items.find((i:any)=>i.name==='Hummus')?.priceCents,499);assert.equal(items.find((i:any)=>i.name==='Homestyle Fries')?.priceCents,265);
 assert.equal(new Set(items.map((i:any)=>i.itemNumber)).size,74);assert.ok(items.every((i:any)=>Number.isInteger(i.priceCents)&&i.priceCents>=0));
});
