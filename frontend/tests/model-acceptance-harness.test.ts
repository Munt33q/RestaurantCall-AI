// These verify the acceptance tool, not a live model. No requests are made.
import test from 'node:test';import assert from 'node:assert/strict';
import {acceptanceCases,acceptanceMenu,evaluateAcceptance,isolatedModelEnvironment} from '../../recovery/phase3/model-acceptance-contract';
import {understandVoiceTurn,type Understanding} from '../lib/ai-menu';
import {decideTurn} from '../lib/voice-engine';
const configured={ACCEPTANCE_AI_API_KEY:'dedicated-test-fixture',ACCEPTANCE_AI_BASE_URL:'https://model.example.test/v1',ACCEPTANCE_AI_MODEL:'acceptance-fixture'};
test('model acceptance rejects ambient production credentials and removes unrelated credentials/data',()=>{
 assert.throws(()=>isolatedModelEnvironment({AI_API_KEY:'ambient',AI_BASE_URL:'https://prod.example.test',AI_MODEL:'production'},false),/Missing explicit/);
 const isolated=isolatedModelEnvironment({...configured,DATABASE_URL:'postgres://production',DIRECT_DATABASE_URL:'postgres://production',STAFF_SESSION_SECRET:'production',TELNYX_API_KEY:'production',STRIPE_SECRET_KEY:'production',NODE_OPTIONS:'--require unsafe',AI_API_KEY:'ambient',HTTPS_PROXY:'https://proxy.example.test'},false);
 for(const key of ['DATABASE_URL','DIRECT_DATABASE_URL','STAFF_SESSION_SECRET','TELNYX_API_KEY','STRIPE_SECRET_KEY','NODE_OPTIONS','HTTPS_PROXY','ACCEPTANCE_AI_API_KEY'])assert.equal(isolated[key],undefined,key);
 assert.equal(isolated.NODE_ENV,'test');assert.equal(isolated.AI_API_KEY,configured.ACCEPTANCE_AI_API_KEY);assert.equal(isolated.AI_FALLBACK_ENABLED,'false');
});
test('acceptance endpoints cannot embed credentials or use cleartext, and fallback needs explicit independent credentials',()=>{
 for(const url of ['http://model.example.test','https://user:password@model.example.test','https://model.example.test?key=value','https://model.example.test#token'])assert.throws(()=>isolatedModelEnvironment({...configured,ACCEPTANCE_AI_BASE_URL:url},false));
 assert.throws(()=>isolatedModelEnvironment(configured,true),/ACCEPTANCE_DEEPSEEK_API_KEY/);
 const fallback=isolatedModelEnvironment({ACCEPTANCE_DEEPSEEK_API_KEY:'independent-fixture',ACCEPTANCE_DEEPSEEK_BASE_URL:'https://fallback.example.test/v1',ACCEPTANCE_DEEPSEEK_MODEL:'fallback-fixture'},true);
 assert.equal(fallback.AI_BASE_URL,undefined);assert.equal(fallback.AI_FALLBACK_ENABLED,'true');assert.equal(fallback.DEEPSEEK_API_KEY,'independent-fixture');
});
const sample=acceptanceCases()[0];
const understood:Understanding={speech:'add requested items',reasoningSource:'ai',diagnostics:{requestedModel:'fixture',reportedModel:'fixture',reasoningEffort:'low',reasoningTokens:null,modelMs:20,finishReason:'stop',provider:'flatrouter',attempts:[{provider:'flatrouter',model:'fixture',ok:true,status:200,ms:20}]}};
const decision={state:{...sample.state,items:sample.expectedItems},reply:'Added two Classic Burgers and one Crispy Fries. Anything else?',submit:false};
test('acceptance cannot pass on deterministic parsing, missing HTTP proof, wrong quantity, or premature submission',()=>{
 assert.equal(evaluateAcceptance(sample,understood,decision,'flatrouter').ok,true);
 const cases=[
  evaluateAcceptance(sample,{...understood,reasoningSource:'app'},decision,'flatrouter'),
  evaluateAcceptance(sample,{...understood,diagnostics:{...understood.diagnostics!,attempts:[]}},decision,'flatrouter'),
  evaluateAcceptance(sample,understood,{...decision,state:{...sample.state,items:[{menuItemId:'classic',quantity:1}]}},'flatrouter'),
  evaluateAcceptance(sample,understood,{...decision,submit:true},'flatrouter'),
  evaluateAcceptance(sample,{...understood,assistantReply:'Your order is placed.'},decision,'flatrouter'),
 ];
 for(const checked of cases)assert.equal(checked.ok,false);
});
test('fallback acceptance needs both controlled primary failure and actual successful fallback provenance',()=>{
 assert.equal(evaluateAcceptance(sample,understood,decision,'deepseek').ok,false);
 const fallback:Understanding={...understood,diagnostics:{...understood.diagnostics!,provider:'deepseek',attempts:[{provider:'flatrouter',model:'fixture',ok:false,status:503,error:'provider_http_503',ms:1},{provider:'deepseek',model:'fixture-fallback',ok:true,status:200,ms:20}]}};
 assert.equal(evaluateAcceptance(sample,fallback,decision,'deepseek').ok,true);
 fallback.diagnostics!.attempts!.shift();assert.equal(evaluateAcceptance(sample,fallback,decision,'deepseek').ok,false);
});
test('question, safety and language cases reject silent edits or inadequate spoken replies',()=>{
 for(const id of ['ambiguous-burger','price-question','allergen-uncertainty','spanish-preference']){
  const question=acceptanceCases().find(s=>s.id===id)!;
  assert.equal(evaluateAcceptance(question,understood,{state:question.state,reply:'Okay.',submit:false},'flatrouter').ok,false,id);
 }
});
test('synthetic acceptance matrix runs through actual interpretation and cart validation (mocked provider, not live acceptance)',async()=>{
 const old=global.fetch;const keys=['AI_API_KEY','AI_BASE_URL','AI_MODEL','AI_FALLBACK_ENABLED','NODE_ENV'] as const;const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const replies:Record<string,unknown>={
  'compound-add':{action:'add',items:[{menuItemId:'i1',quantity:2},{menuItemId:'i3',quantity:1}]},
  'ambiguous-burger':{action:'clarify',reply:'Classic Burger or Chicken Burger: which would you like?',mentionedItemIds:['i1','i2'],offeredItemIds:['i1','i2']},
  'contextual-choice':{action:'add',items:[{menuItemId:'i2',quantity:1}]},
  'quantity-replacement':{action:'set',items:[{menuItemId:'i1',quantity:3}]},
  'price-question':{action:'answer',reply:'The Classic Burger costs $10.00 before tax.',mentionedItemIds:['i1']},
  'allergen-uncertainty':{action:'answer',reply:'I cannot verify allergen safety. Please check with the restaurant.',mentionedItemIds:['i1']},
  'injection-no-order':{action:'clarify',reply:'I can help choose menu items. What would you like?'},
  'unavailable-stock':{action:'add',items:[{menuItemId:'i4',quantity:1}]},
  'spanish-preference':{action:'answer',reply:'El precio de Classic Burger es $10.00 antes de impuestos.',mentionedItemIds:['i1']},
 };
 Object.assign(process.env,{NODE_ENV:'test',AI_API_KEY:'synthetic-matrix-fixture',AI_BASE_URL:'https://matrix.example.test/v1',AI_MODEL:'matrix-fixture',AI_FALLBACK_ENABLED:'false'});
 let current='';let calls=0;
 global.fetch=async()=>{calls++;return Response.json({model:'matrix-fixture',choices:[{finish_reason:'stop',message:{content:JSON.stringify(replies[current])}}]});};
 try{
  for(const c of acceptanceCases()){
   current=c.id;const result=await understandVoiceTurn(c.speech,acceptanceMenu,{...c.state,history:c.history,forceModelProbe:true});
   const next=decideTurn(c.state,result.speech,acceptanceMenu,825,result.extracted,result.operation,result.menuCategory,result);
   const evaluated=evaluateAcceptance(c,result,next,'flatrouter');assert.deepEqual(evaluated.failures,[],c.id);
  }
  assert.equal(calls,9);
 }finally{global.fetch=old;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else Object.assign(process.env,{[key]:saved[key]});}}
});
