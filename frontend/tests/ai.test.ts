import test from 'node:test';
import assert from 'node:assert/strict';
import {extractMenuLines} from '../lib/ai-menu';
const menu=[{id:'burger',name:'Classic Burger',itemNumber:1,priceCents:1299,isAvailable:true,stockQty:20}];
function configure(){process.env.AI_API_KEY='test-key-not-real';process.env.AI_BASE_URL='https://provider.example/v1';process.env.AI_MODEL='test-model';}
test('AI extraction tolerates a provider response after four seconds',async()=>{
 configure();const previous=global.fetch;
 global.fetch=async(_input,init)=>new Promise<Response>((resolve,reject)=>{
  const timer=setTimeout(()=>resolve(Response.json({choices:[{message:{content:'{"items":[{"menuItemId":"burger","quantity":2}]}'}}]})),4200);
  init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('Provider timeout'));},{once:true});
 });
 try{assert.deepEqual(await extractMenuLines('Two of option number one',menu),[{menuItemId:'burger',quantity:2}]);}finally{global.fetch=previous;}
});
test('AI never inserts a made-up menu ID',async()=>{
 configure();const previous=global.fetch;global.fetch=async()=>Response.json({choices:[{message:{content:'{"items":[{"menuItemId":"invented","quantity":1}]}'}}]});
 try{assert.equal(await extractMenuLines('Some food please',menu),undefined);}finally{global.fetch=previous;}
});
test('legacy item extractor skips category requests',async()=>{
 configure();const previous=global.fetch;let requests=0;global.fetch=async()=>{requests++;throw new Error('should not call');};
 try{assert.equal(await extractMenuLines('what drinks do you have',menu),undefined);assert.equal(requests,0);}finally{global.fetch=previous;}
});
test('contextual reasoning resolves quantity changes but never confirms an order',async()=>{
 configure();const {understandVoiceTurn}=await import('../lib/ai-menu');const previous=global.fetch;let prompt='';
 global.fetch=async(_input,init)=>{prompt=String(init?.body);return Response.json({choices:[{message:{content:'{"action":"set","items":[{"menuItemId":"burger","quantity":2}]}'}}]});};
 try{
 const result=await understandVoiceTurn('make that two',menu,{phase:'ordering',items:[{menuItemId:'burger',quantity:1}],history:[]});
 assert.equal(result.operation,'set');assert.equal(result.extracted?.[0].quantity,2);assert.match(JSON.parse(prompt).messages[0].content,/\"items\":\[\{\"menuItemId\":\"i1\",\"quantity\":1\}\]/);
 global.fetch=async()=>Response.json({choices:[{message:{content:'{"action":"confirm","items":[]}'}}]});
 assert.equal((await understandVoiceTurn('do whatever',menu,{phase:'confirm',items:[],history:[]})).speech,'do whatever');
 }finally{global.fetch=previous;}
});
test('AI classifies an unfamiliar requested food without inventing availability',async()=>{
 configure();const {understandVoiceTurn}=await import('../lib/ai-menu');const previous=global.fetch;
 global.fetch=async()=>Response.json({choices:[{message:{content:'{"action":"answer","reply":"Ramen is not on our menu, but we have a Classic Burger. Would you like that?","mentionedItemIds":["burger"],"offeredItemIds":["burger"]}'}}]});
 try{const result=await understandVoiceTurn('do you have ramen',menu,{phase:'ordering',items:[],history:[]});assert.equal(result.speech,'do you have ramen');assert.match(result.assistantReply??'',/Ramen is not on our menu/);assert.equal(result.reasoningSource,'ai');assert.equal(result.extracted,undefined);}finally{global.fetch=previous;}
});
test('accepting an offered choice is resolved by the app without AI guessing',async()=>{
 configure();const {understandVoiceTurn}=await import('../lib/ai-menu');const previous=global.fetch;let requests=0;global.fetch=async()=>{requests++;throw new Error('must not guess');};
 try{assert.equal((await understandVoiceTurn('yes please',menu,{phase:'ordering',items:[],history:[],suggestedItemIds:['burger']})).speech,'yes please');assert.equal(requests,0);}finally{global.fetch=previous;}
});
