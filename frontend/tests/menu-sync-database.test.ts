import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';
import {runMenuSync} from '../lib/menu-sync';import {saveCatalogItem} from '../lib/catalog-store';
test('durable menu sync retries, reuses its document and never loses a catalog edit',async t=>{
 const db=new PGlite();t.after(()=>db.close());for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('drizzle/'+f,'utf8').replace(/CREATE EXTENSION[^;]*;/gi,''));
 let conn:any=db;const sql:any=async(s:TemplateStringsArray,...values:any[])=>(await conn.query(s.reduce((a,x,i)=>a+(i?'$'+i:'')+x,''),values)).rows;sql.json=(x:any)=>JSON.stringify(x);sql.begin=(fn:any)=>db.transaction(async tx=>{conn=tx;try{return await fn(sql);}finally{conn=db;}});
 const rid=randomUUID();process.env.RESTAURANT_ID=rid;await sql`INSERT INTO restaurants(id,name,tax_rate_bps) VALUES(${rid},'Sync fixture',825)`;
 const item=await saveCatalogItem({name:'Burger',category:'Mains',description:'Fixture',priceCents:1299,stockQty:3},undefined,undefined,sql);
 assert.equal((await sql`SELECT count(*)::int AS n FROM menu_sync_jobs`)[0].n,1);
 await sql`UPDATE menu_sync_jobs SET next_at=now()`;
 const config={enabled:true,agent:'agent_fixture',branch:'branch_fixture',key:'fixture-only'};
 const original=global.fetch;let fail=true,creates=0,patches=0,attached=false;
 global.fetch=async(input,init)=>{const url=String(input);if(url.endsWith('knowledge-base/text')){creates++;return Response.json({id:'doc_fixture'});}if(url.includes('knowledge-base/doc_fixture')){patches++;return Response.json({id:'doc_fixture'});}if(fail)return new Response('do not persist response body',{status:503});if(init?.method==='PATCH'){attached=true;return Response.json({});}return Response.json({conversation_config:{agent:{prompt:{knowledge_base:attached?[{id:'doc_fixture'}]:[]}}}});};t.after(()=>{global.fetch=original;});
 await runMenuSync({sql,config});let [job]=await sql`SELECT * FROM menu_sync_jobs`;assert.equal(job.document_id,'doc_fixture');assert.equal(job.attempts,1);assert.match(job.last_error,/503/);assert.equal((await sql`SELECT price_cents FROM menu_items WHERE id=${item.id}`)[0].price_cents,1299);
 fail=false;await sql`UPDATE menu_sync_jobs SET next_at=now()`;await runMenuSync({sql,config});[job]=await sql`SELECT * FROM menu_sync_jobs`;assert.equal(creates,1);assert.equal(job.last_error,null);assert.ok(job.last_synced_at);assert.equal(attached,true);
 await saveCatalogItem({name:'Burger',category:'Mains',description:'Updated',priceCents:1399,stockQty:0},item.id,item.version,sql);await sql`UPDATE menu_sync_jobs SET next_at=now()`;await runMenuSync({sql,config});assert.equal(creates,1);assert.ok(patches>0);
 await sql`UPDATE menu_sync_jobs SET next_at=now()`;await runMenuSync({sql,config:{...config,agent:'other_agent'}});assert.match((await sql`SELECT last_error FROM menu_sync_jobs`)[0].last_error,/association/);
});
