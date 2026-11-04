import test from 'node:test';import assert from 'node:assert/strict';
import {understandVoiceTurn} from '../lib/ai-menu';import {decideTurn,initialState} from '../lib/voice-engine';import {RelayController} from '../lib/relay/controller';
const menu=[{id:'moz',name:'Mozzarella Sticks',category:'Sides',itemNumber:9,priceCents:649,isAvailable:true,stockQty:20},{id:'fries',name:'Crispy Fries',category:'Sides',itemNumber:2,priceCents:399,isAvailable:true,stockQty:20}];
const cart=()=>({...initialState(),items:[{menuItemId:'moz',quantity:1},{menuItemId:'fries',quantity:1}]});
test('total and tax questions use the current quote and preserve checkout phase without AI',async()=>{
 const prior=global.fetch;global.fetch=async()=>{throw new Error('should not need a model for arithmetic');};
 try{for(const phase of ['ordering','name','payment','confirm'] as const){for(const speech of ["what's the total",'whats the total bill','how much is tax?']){const state={...cart(),phase,customerName:'Suffie',paymentMethod:'stripe' as const};const u=await understandVoiceTurn(speech,menu,{...state,history:[]});assert.equal(u.assistantReply,undefined);const r=decideTurn(state,u.speech,menu,825,u.extracted,u.operation,undefined,u);assert.match(r.reply,/\$0\.86/);assert.match(r.reply,/8\.25/);assert.match(r.reply,/\$11\.34/);assert.equal(r.state.phase,phase);assert.equal(r.submit,false);}}}finally{global.fetch=prior;}
});
test('name is read back for explicit confirmation and by-card progresses without the model',async()=>{
 let state=decideTurn(cart(),"that's it",menu,825).state;assert.equal(state.phase,'name');
 let r=decideTurn(state,'Suffie.',menu,825);assert.match(r.reply,/Suffie.*correct/i);assert.equal(r.state.phase,'name');
 r=decideTurn(r.state,'no',menu,825);assert.equal(r.state.customerName,'');
 r=decideTurn(r.state,'my name is Munteeq',menu,825);r=decideTurn(r.state,'yes',menu,825);assert.equal(r.state.phase,'payment');assert.match(r.reply,/cash.*card/i);
 const prior=global.fetch;global.fetch=async()=>{throw new Error('offline');};try{const u=await understandVoiceTurn('By card.',menu,{...r.state,history:[]});r=decideTurn(r.state,u.speech,menu,825,u.extracted,u.operation,undefined,u);assert.equal(r.state.phase,'payment_link');assert.equal(r.state.paymentMethod,'stripe');r=decideTurn(r.state,'no',menu,825);r=decideTurn(r.state,'none',menu,825);r=decideTurn(r.state,'no notes',menu,825);assert.equal(r.state.phase,'confirm');assert.match(r.reply,/Munteeq/);}finally{global.fetch=prior;}
});
test('two explicit shorthand items cannot silently lose the second model omission',async()=>{
 process.env.AI_API_KEY='test';process.env.AI_BASE_URL='https://example.test/v1';process.env.AI_MODEL='test';const prior=global.fetch;
 global.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({action:'add',items:[{menuItemId:'moz',quantity:1}]})}}]});
 try{const u=await understandVoiceTurn('add moz sticks and add fies',menu,{...initialState(),history:[]});const r=decideTurn(initialState(),u.speech,menu,825,u.extracted,u.operation,undefined,u);assert.equal(r.state.items.length,2);assert.match(r.reply,/Mozzarella Sticks.*Crispy Fries/);}finally{global.fetch=prior;}
});
test('hello and model failures continue the current checkout prompt instead of a generic greeting',async()=>{
 const prior=global.fetch;global.fetch=async()=>new Response('unavailable',{status:503});try{for(const phase of ['name','payment','confirm'] as const){const state={...cart(),phase,customerName:phase==='name'?'':'Suffie',paymentMethod:phase==='confirm'?'stripe' as const:null};const u=await understandVoiceTurn('Are you there?',menu,{...state,history:[]});const r=decideTurn(state,u.speech,menu,825,u.extracted,u.operation,undefined,u);assert.match(r.reply,phase==='name'?/name/i:phase==='payment'?/cash.*card/i:/confirm/i);assert.doesNotMatch(r.reply,/how can I help|item number/i);assert.equal(r.state.phase,phase);}}finally{global.fetch=prior;}
});
test('a speaker-start notification alone cannot erase the pending review or prevent hangup',async()=>{
 const sent:any[]=[];let acks=0;const c=new RelayController({send:m=>sent.push(m),prepare:async()=>({speech:'confirm',turn:0}),commit:async()=>({reply:'Your order is confirmed. Goodbye.',turn:1,deliveryId:'last',finished:true,phase:'complete'}),ack:async()=>{acks++;},interrupt:async()=>{}});
 await c.handle({type:'prompt',voicePrompt:'confirm',last:true});await c.handle({type:'info',name:'clientSpeaking',value:'on'});await c.handle({type:'info',name:'tokensPlayed',value:'Your order is confirmed. Goodbye.'});await c.handle({type:'info',name:'agentSpeaking',value:'off'});assert.equal(acks,1);assert.equal(sent.at(-1).type,'end');
});
test('a repeated confirm after an interrupted review can advance after complete playback',async()=>{
 let commits=0;const sent:any[]=[];const c=new RelayController({send:m=>sent.push(m),prepare:async()=>({speech:'confirm',turn:commits}),commit:async()=>{commits++;return commits===1?{reply:'Full order. Say confirm.',turn:1,deliveryId:'review',phase:'confirm',requiresReadback:true}:{reply:'Placed. Goodbye.',turn:2,deliveryId:'done',phase:'complete',finished:true};},ack:async()=>{},interrupt:async()=>{}});
 await c.handle({type:'prompt',voicePrompt:'confirm',last:true});await c.handle({type:'info',name:'tokensPlayed',value:'Full order. Say confirm.'});await c.handle({type:'info',name:'agentSpeaking',value:'off'});
 await c.handle({type:'info',name:'clientSpeaking',value:'on'});await c.handle({type:'prompt',voicePrompt:'confirm',last:true});assert.equal(commits,2);assert.equal(sent.at(-1).token,'Placed. Goodbye.');
});
test('answering a menu question at payment keeps the payment follow-up',()=>{
 const state={...cart(),phase:'payment' as const,customerName:'Suffie'};const r=decideTurn(state,'do you have fries',menu,825,undefined,undefined,undefined,{assistantReply:'Yes, we have Crispy Fries.'});assert.match(r.reply,/Crispy Fries.*cash.*card/i);assert.equal(r.state.phase,'payment');
});
test('complete model quantities survive compound-item reconciliation',async()=>{
 const prior=global.fetch;global.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({action:'add',items:[{menuItemId:'moz',quantity:2},{menuItemId:'fries',quantity:2}]})}}]});
 try{const u=await understandVoiceTurn('two orders of moz sticks and two crispy fries',menu,{...initialState(),history:[]});assert.deepEqual(u.extracted,[{menuItemId:'moz',quantity:2},{menuItemId:'fries',quantity:2}]);}finally{global.fetch=prior;}
});
test('questions cannot become pickup names and Bill remains a valid name',async()=>{
 const prior=global.fetch;global.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({action:'answer',reply:'That information is not listed.',mentionedItemIds:[],offeredItemIds:[]})}}]});
 try{for(const speech of ['Where is the restaurant','Is delivery available','Do you deliver']){const state={...cart(),phase:'name' as const};const u=await understandVoiceTurn(speech,menu,{...state,history:[]});const r=decideTurn(state,u.speech,menu,825,u.extracted,u.operation,undefined,u);assert.equal(r.state.customerName,'');assert.match(r.reply,/name/i);}const r=decideTurn({...cart(),phase:'name'},'Bill',menu,825);assert.equal(r.state.customerName,'Bill');}finally{global.fetch=prior;}
});
test('a caller can repeat confirm while the played-review acknowledgment is in flight',async()=>{
 let resolveAck:any;let commits=0;const c=new RelayController({send:()=>{},prepare:async()=>({speech:'confirm',turn:commits}),commit:async()=>{commits++;return {reply:'Review.',turn:commits,deliveryId:'review',phase:'confirm',requiresReadback:true};},ack:async()=>new Promise<void>(r=>{resolveAck=r;}),interrupt:async()=>{}});
 await c.handle({type:'prompt',voicePrompt:'confirm',last:true});await c.handle({type:'info',name:'tokensPlayed',value:'Review.'});const ack=c.handle({type:'info',name:'agentSpeaking',value:'off'});await new Promise(r=>setTimeout(r,0));await c.handle({type:'info',name:'clientSpeaking',value:'on'});const next=c.handle({type:'prompt',voicePrompt:'confirm',last:true});resolveAck();await ack;await next;assert.equal(commits,2);
});
test('presence checks cannot be captured as pickup names',()=>{
 for(const speech of ["I'm just checking.",'Just checking.','Okay.','I want to finish.']){const r=decideTurn({...cart(),phase:'name'},speech,menu,825);assert.equal(r.state.customerName,'');assert.match(r.reply,/name/i);}
 const r=decideTurn({...cart(),phase:'name'},"I'm Suffie.",menu,825);assert.equal(r.state.customerName,'Suffie');
});
test('an omitted item with an invalid spoken quantity cannot crash reconciliation',async()=>{
 const prior=global.fetch;global.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({action:'add',items:[{menuItemId:'moz',quantity:1}]})}}]});
 try{const u=await understandVoiceTurn('add moz sticks and 100 crispy fries',menu,{...initialState(),history:[]});assert.equal(u.reasoningSource,'fallback');assert.equal(u.extracted,undefined);}finally{global.fetch=prior;}
});
test('duplicate speech at name collection repeats the name prompt instead of an item prompt',async()=>{
 const prior=Date.now;let now=100;Date.now=()=>now;const sent:any[]=[];
 try{const c=new RelayController({send:m=>sent.push(m),prepare:async()=>({speech:'Suffie',turn:0}),commit:async()=>({reply:'I heard Suffie. Is that name correct?',turn:1,phase:'name'}),ack:async()=>{},interrupt:async()=>{}});await c.handle({type:'prompt',voicePrompt:'Suffie',last:true});now+=2000;await c.handle({type:'prompt',voicePrompt:'Suffie',last:true});assert.match(sent.at(-1).token,/Suffie.*correct/);assert.doesNotMatch(sent.at(-1).token,/item|add one more/i);}finally{Date.now=prior;}
});
