import test from 'node:test';
import assert from 'node:assert/strict';
import {understandVoiceTurn} from '../lib/ai-menu';
const menu=[{id:'burger',name:'Classic Burger',itemNumber:1,priceCents:1299,isAvailable:true,stockQty:10}];
test('voice requests explicitly select low reasoning without incompatible temperature',async()=>{
 process.env.AI_API_KEY='test';process.env.AI_BASE_URL='https://example.test/v1';process.env.AI_MODEL='gpt-6.1-sol';
 const previous=global.fetch;let request:any;
 global.fetch=async(_url,init)=>{request=JSON.parse(String(init?.body));return Response.json({model:'gpt-6.1-sol',usage:{completion_tokens_details:{reasoning_tokens:32}},choices:[{message:{content:JSON.stringify({action:'clarify',reply:'Which burger would you like?',mentionedItemIds:['burger'],offeredItemIds:['burger']})}}]});};
 try{const answer=await understandVoiceTurn('do you guys have burgers',menu,{phase:'ordering',items:[],history:[]});assert.equal(request.reasoning_effort,'low');assert.equal(request.temperature,undefined);assert.equal(answer.diagnostics?.reportedModel,'gpt-6.1-sol');assert.equal(answer.diagnostics?.reasoningTokens,32);}finally{global.fetch=previous;}
});
test('short model references are mapped back to real menu IDs',async()=>{
 process.env.AI_API_KEY='test';process.env.AI_BASE_URL='https://example.test/v1';process.env.AI_MODEL='gpt-6.1-sol';
 const previous=global.fetch;
 global.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));assert.match(body.messages[0].content,/"id":"i1"/);return Response.json({model:'gpt-6.1-sol',choices:[{message:{content:JSON.stringify({action:'answer',reply:'We have a Classic Burger.',mentionedItemIds:['i1'],offeredItemIds:['i1']})}}]});};
 try{const answer=await understandVoiceTurn('do you guys have burgers',menu,{phase:'ordering',items:[],history:[]});assert.deepEqual(answer.offeredItemIds,['burger']);assert.equal(answer.reasoningSource,'ai');}finally{global.fetch=previous;}
});
test('voice payload keeps menu facts and state with smaller prompt and bounded recent context',async()=>{
 process.env.AI_API_KEY='test';process.env.AI_BASE_URL='https://example.test/v1';process.env.AI_MODEL='gpt-6-luna';
 const previous=global.fetch;let request:any;
 const facts=[...menu,{id:'cola',name:'Cola',itemNumber:2,priceCents:250,isAvailable:true,stockQty:0,category:'Drinks',description:'Caffeine free option available only on request.'}];
 global.fetch=async(_url,init)=>{request=JSON.parse(String(init?.body));return Response.json({model:'gpt-6-luna',usage:{prompt_tokens:450,completion_tokens:80,completion_tokens_details:{reasoning_tokens:20}},choices:[{finish_reason:'stop',message:{content:JSON.stringify({action:'clarify',reply:'Which burger would you like?',mentionedItemIds:['i1'],offeredItemIds:['i1']})}}]});};
 try{
 const answer=await understandVoiceTurn('what kind of burgers do you have',facts,{phase:'ordering',items:[{menuItemId:'burger',quantity:2}],history:Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',content:`history-${i}`})),customerName:'Alex',paymentMethod:'cash',suggestedItemIds:['burger'],taxRateBps:700});
 const prompt=request.messages.filter((m:any)=>m.role==='system').map((m:any)=>m.content).join('\n');
 assert.ok(prompt.length<4200,`prompt was ${prompt.length} characters`);
 assert.equal(request.messages.filter((m:any)=>/^history-/.test(m.content)).length,4);
 assert.match(prompt,/Caffeine free option available only on request/);assert.match(prompt,/"available":false/);
 assert.match(prompt,/Alex/);assert.match(prompt,/"quantity":2/);assert.equal(request.max_completion_tokens,1200);
 assert.equal(answer.diagnostics?.inputTokens,450);assert.equal(answer.diagnostics?.outputTokens,80);assert.ok((answer.diagnostics?.inputChars??0)>0);
 }finally{global.fetch=previous;}
});
test('truncated provider output cannot become a spoken answer or cart edit',async()=>{
 process.env.AI_API_KEY='test';process.env.AI_BASE_URL='https://example.test/v1';process.env.AI_MODEL='gpt-6-luna';const previous=global.fetch;
 global.fetch=async()=>Response.json({choices:[{finish_reason:'length',message:{content:JSON.stringify({action:'add',items:[{menuItemId:'i1',quantity:1}]})}}]});
 try{const answer=await understandVoiceTurn('please bring me a classic burger',menu,{phase:'ordering',items:[],history:[]});assert.equal(answer.reasoningSource,'fallback');assert.equal(answer.extracted,undefined);assert.equal(answer.diagnostics?.error,'truncated_response');}finally{global.fetch=previous;}
});
test('explicit compound add bypasses model but ambiguity and modifiers still use reasoning',async()=>{
 process.env.AI_API_KEY='test';process.env.AI_BASE_URL='https://example.test/v1';process.env.AI_MODEL='gpt-6-luna';
 const previous=global.fetch;let calls=0;
 const choices=[...menu,{id:'chicken',name:'Chicken Burger',itemNumber:2,priceCents:1099,isAvailable:true,stockQty:10},{id:'fries',name:'Crispy Fries',itemNumber:3,priceCents:399,isAvailable:true,stockQty:10},{id:'moz',name:'Mozzarella Sticks',itemNumber:4,priceCents:599,isAvailable:true,stockQty:10}];
 global.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify({action:'clarify',reply:'Which burger would you like?',mentionedItemIds:['i1','i2'],offeredItemIds:['i1','i2']})}}]});};
 try{
 const state={phase:'ordering',items:[],history:[]};
 const added=await understandVoiceTurn('add two moz sticks and add fies',choices,state);
 assert.equal(calls,0);assert.equal(added.reasoningSource,'app');assert.deepEqual(added.extracted,[{menuItemId:'moz',quantity:2},{menuItemId:'fries',quantity:1}]);
 const available=await understandVoiceTurn('do you have fries',choices,state);
 assert.equal(available.reasoningSource,'app');assert.deepEqual(available.offeredItemIds,['fries']);assert.equal(calls,0);
 for(const text of ['add a burger','add fries without salt','add fries and do not add mozzarella sticks'])await understandVoiceTurn(text,choices,state);
 assert.equal(calls,3);
 }finally{global.fetch=previous;}
});
