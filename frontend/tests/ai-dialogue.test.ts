import test from 'node:test';
import assert from 'node:assert/strict';
import {understandVoiceTurn} from '../lib/ai-menu';
const menu=[{id:'beef',name:'Classic Burger',category:'Mains',description:'Beef and cheddar',itemNumber:1,priceCents:1299,isAvailable:true,stockQty:10},{id:'chicken',name:'Chicken Burger',category:'Mains',description:'Crispy chicken',itemNumber:5,priceCents:1199,isAvailable:true,stockQty:10}];
function configure(){process.env.AI_API_KEY='test';process.env.AI_BASE_URL='https://example.test/v1';process.env.AI_MODEL='test';}
test('real dialogue path sends each reported paraphrase to the model verbatim with live facts',async()=>{
 configure();const previous=global.fetch;let calls=0;
 global.fetch=async(_url,init)=>{calls++;const payload=JSON.parse(String(init?.body));assert.match(payload.messages[0].content,/"cents":1299/);assert.match(payload.messages[0].content,/"available":true/);return Response.json({choices:[{message:{content:JSON.stringify({action:'clarify',reply:'We have Classic Burger and Chicken Burger. Which would you prefer?',mentionedItemIds:['beef','chicken'],offeredItemIds:['beef','chicken']})}}]});};
 try{for(const speech of ['do u guys have burger','can I get a burger','what kind of burger do u have']){const result=await understandVoiceTurn(speech,menu,{phase:'ordering',items:[],history:[]});assert.match(result.assistantReply??'',/Which would you prefer/);assert.equal(result.extracted,undefined);}assert.equal(calls,3);}finally{global.fetch=previous;}
});
test('model outage gives an honest fallback instead of a fabricated unavailability answer',async()=>{
 configure();const previous=global.fetch;global.fetch=async()=>new Response('unavailable',{status:503});
 try{const result=await understandVoiceTurn('do u guys have burger',menu,{phase:'ordering',items:[],history:[]});assert.match(result.assistantReply??'',/trouble/i);assert.doesNotMatch(result.assistantReply??'',/do not carry/);}finally{global.fetch=previous;}
});
test('invented prices or menu references cannot become spoken answers',async()=>{
 configure();const previous=global.fetch;
 try{for(const answer of [{action:'answer',reply:'The burger is $0.01.',mentionedItemIds:['beef'],offeredItemIds:[]},{action:'answer',reply:'We have lobster.',mentionedItemIds:['invented'],offeredItemIds:['invented']}]){global.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify(answer)}}]});const r=await understandVoiceTurn('what do you have',menu,{phase:'ordering',items:[],history:[]});assert.equal(r.reasoningSource,'fallback');}}finally{global.fetch=previous;}
});
