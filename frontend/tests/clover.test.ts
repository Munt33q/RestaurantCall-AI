import test from 'node:test';
import assert from 'node:assert/strict';
import {cloverOrderMatches,createCloverOrder} from '../lib/clover';

test('Clover content verification checks quantities and totals',()=>{
 assert.equal(cloverOrderMatches({lineItems:{elements:[{name:'Burger',price:1299,quantity:2},{name:'Fries',price:499,quantity:1}]}},[
  {item_name:'Burger',unit_price_cents:1299,quantity:2},{item_name:'Fries',unit_price_cents:499,quantity:1}
 ]),true);
 assert.equal(cloverOrderMatches({lineItems:{elements:[{name:'Burger',price:1299,quantity:1}]}},[
  {item_name:'Burger',unit_price_cents:1299,quantity:2}
 ]),false);
});

test('ambiguous Clover order creation is not retried automatically',async()=>{
 const old={CLOVER_API_TOKEN:process.env.CLOVER_API_TOKEN,CLOVER_MERCHANT_ID:process.env.CLOVER_MERCHANT_ID,CLOVER_BASE_URL:process.env.CLOVER_BASE_URL};
 Object.assign(process.env,{CLOVER_API_TOKEN:'fixture',CLOVER_MERCHANT_ID:'merchant',CLOVER_BASE_URL:'https://clover.test'});
 let creates=0;
 const transport:typeof fetch=async(url,init)=>{
  if(String(url).endsWith('/order_types'))return Response.json({elements:[]});
  if(String(url).endsWith('/orders')){creates++;return new Response('gateway timeout',{status:502});}
  throw new Error('unexpected request');
 };
 try{await assert.rejects(()=>createCloverOrder({id:'12345678',payment_status:'paid'},transport),/Clover request 502/);assert.equal(creates,1);}finally{
  for(const key of Object.keys(old) as (keyof typeof old)[]){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}
 }
});
