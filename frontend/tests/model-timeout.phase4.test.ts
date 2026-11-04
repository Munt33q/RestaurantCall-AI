import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';
import {understandVoiceTurn} from '../lib/ai-menu';import {decideTurn,initialState} from '../lib/voice-engine';
test('phase4 real loopback HTTP deadline aborts a stalled primary and validates fallback edits',async()=>{
 const timers:ReturnType<typeof setTimeout>[]=[];let primaryCalls=0,fallbackCalls=0;
 const primary=createServer((_req,res)=>{primaryCalls++;timers.push(setTimeout(()=>res.end('{}'),2000));});
 const fallback=createServer((_req,res)=>{fallbackCalls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({model:'synthetic-fallback',choices:[{finish_reason:'stop',message:{content:JSON.stringify({action:'add',items:[{menuItemId:'i1',quantity:2}]})}}]}));});
 for(const server of [primary,fallback])await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const base=(server:typeof primary)=>{const a=server.address();assert.ok(a&&typeof a==='object');return `http://127.0.0.1:${a.port}/v1`;};
 Object.assign(process.env,{NODE_ENV:'test',AI_API_KEY:'synthetic-primary',AI_BASE_URL:base(primary),AI_MODEL:'synthetic-primary',AI_PRIMARY_TIMEOUT_MS:'500',AI_FALLBACK_ENABLED:'true',DEEPSEEK_API_KEY:'synthetic-fallback',AI_FALLBACK_BASE_URL:base(fallback),AI_FALLBACK_MODEL:'synthetic-fallback',AI_FALLBACK_TIMEOUT_MS:'1000'});
 try{const menu=[{id:'b',name:'Classic Burger',itemNumber:1,priceCents:1000,isAvailable:true,stockQty:10}],start=performance.now();const u=await understandVoiceTurn('Please put a pair of Classic Burgers on my order',menu,{...initialState(),history:[]});const elapsed=performance.now()-start;
  assert.equal(primaryCalls,1);assert.equal(fallbackCalls,1);assert.equal(u.reasoningSource,'ai');assert.equal(u.diagnostics?.attempts?.[0].error,'timeout');assert.equal(u.diagnostics?.attempts?.[1].ok,true);assert.ok(elapsed>=450&&elapsed<2500,`Loopback timeout/fallback took ${elapsed} ms`);
  const r=decideTurn(initialState(),u.speech,menu,825,u.extracted,u.operation,undefined,u);assert.deepEqual(r.state.items,[{menuItemId:'b',quantity:2}]);assert.equal(r.submit,false);
 }finally{timers.forEach(clearTimeout);for(const server of [primary,fallback]){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}}
});
