// Reconstructed requirement tests for later features absent from the retained original test snapshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import {handleLiveVoiceEvent,type VoiceDependencies} from '../lib/live-voice-transport';
import {promotionQuote,validateCatalogItem,type Promotion} from '../lib/catalog-policy';
import {recoveryGate,recoverySmsGate,credentialHash,sealCredential,openCredential,freshRecoveryState} from '../lib/engagement/recovery-contract';
import {initialState} from '../lib/voice-engine';

function voiceFixture(admitted=true){
 const commands:{action:string;body:Record<string,unknown>}[]=[];let opens=0;
 const deps:VoiceDependencies={connectionId:'fixture-app',number:'+12025550101',socketUrl:'wss://example.test/relay',secretRef:'fixture-secret-reference',open:async()=>{opens++;},admitted:async()=>admitted,token:async()=>'fixture-grant',command:async(_id,action,body)=>{commands.push({action,body});},ended:async()=>{}};
 const event={event_type:'call.answered',payload:{call_control_id:'fixture-call',connection_id:'fixture-app',to:deps.number,from:'+12025550123'}};
 return {commands,deps,event,opens:()=>opens};
}

test('recovery: directionless answered callback requires the previously admitted session',async()=>{
 const blocked=voiceFixture(false);assert.deepEqual(await handleLiveVoiceEvent(blocked.event,blocked.deps),{ignored:true});
 assert.equal(blocked.opens(),0);assert.equal(blocked.commands.length,0);
 const admitted=voiceFixture();await handleLiveVoiceEvent(admitted.event,admitted.deps);
 assert.equal(admitted.opens(),1);assert.equal(admitted.commands[0].action,'conversation_relay_start');
 assert.equal('events' in admitted.commands[0].body,false,'Call Control rejects TeXML events');
 assert.equal(new URL(admitted.commands[0].body.url as string).searchParams.get('token'),'fixture-grant');
});

test('recovery: foreign application callback cannot open a session or issue a command',async()=>{
 const f=voiceFixture();f.event.payload.connection_id='foreign-app';await handleLiveVoiceEvent(f.event,f.deps);
 assert.equal(f.opens(),0);assert.equal(f.commands.length,0);
});

test('recovery: rejected relay start attempts audible outage closure instead of silent continuation',async()=>{
 const f=voiceFixture();f.deps.command=async(_id,action,body)=>{f.commands.push({action,body});if(action==='conversation_relay_start')throw Error('fixture rejection');};
 await assert.rejects(()=>handleLiveVoiceEvent(f.event,f.deps),/fixture rejection/);
 assert.equal(f.commands[1].action,'speak');assert.match(f.commands[1].body.payload as string,/interrupted/);
});

test('recovery: discounts choose one eligible offer, preserve other lines and floor tax',()=>{
 const promotions:Promotion[]=[{id:'percent',title:'Twenty percent',kind:'percent',value:2000,itemIds:['burger'],active:true,startsAt:null,endsAt:null},{id:'fixed',title:'Five off',kind:'fixed',value:500,itemIds:[],active:true,startsAt:null,endsAt:null}];
 const result=promotionQuote([{itemId:'burger',priceCents:1299,quantity:2},{itemId:'fries',priceCents:499,quantity:1}],825,promotions);
 assert.equal(result.discountCents,519);assert.equal(result.promotionId,'percent');assert.equal(result.taxCents,212);assert.equal(result.totalCents,2790);
 promotions[0].active=false;assert.equal(promotionQuote([{itemId:'burger',priceCents:100,quantity:1}],0,promotions).totalCents,0,'Discount cannot exceed eligible subtotal');
});

test('recovery: catalog rejects negative inventory and extra untrusted price fields',()=>{
 const item={name:'Fixture',category:'Sides',priceCents:499,stockQty:3};
 assert.equal(validateCatalogItem(item).priceCents,499);
 assert.throws(()=>validateCatalogItem({...item,stockQty:-1}));
 assert.throws(()=>validateCatalogItem({...item,computedTotal:1}));
});

test('recovery: recovery credentials are purpose-separated, authenticated and expiry-bound',()=>{
 const secret='recovery-fixture-secret-at-least-32-characters';
 assert.notEqual(credentialHash('fixture',secret,'token'),credentialHash('fixture',secret,'code'));
 const sealed=sealCredential('fixture',secret);assert.equal(openCredential(sealed,secret),'fixture');
 assert.throws(()=>openCredential(sealed,'different-secret-at-least-32-characters'));
 const grant={expiresAt:2000,claimed:false,committed:false,callerHash:'fixture',expectedHash:'fixture',failures:0};
 assert.equal(recoveryGate(grant,1000),null);
 for(const change of [{claimed:true},{committed:true},{expectedHash:'other'},{failures:5},{expiresAt:1000}])assert.ok(recoveryGate({...grant,...change},1000));
});

test('recovery: resumed draft revalidates stock and returns to fresh confirmation',()=>{
 const previous={...initialState(),phase:'confirm' as const,items:[{menuItemId:'fixture',quantity:4}],customerName:'Fixture',nameConfirmed:true,paymentMethod:'cash' as const,notificationChannel:'call' as const,notificationConsent:true};
 const result=freshRecoveryState(previous,[{id:'fixture',name:'Fixture item',priceCents:499,isAvailable:true,stockQty:2,itemNumber:1}]);
 assert.equal(result.changed,true);assert.equal(result.state.items[0].quantity,2);assert.equal(result.state.phase,'ordering');assert.equal(result.state.nameConfirmed,false);assert.equal(result.state.paymentMethod,null);assert.equal(result.state.notificationChannel,undefined);
});

test('recovery: recovery SMS requires registration, current permission and a daily limit',()=>{
 const input={consent:true,smsEnabled:true,registered:true,recoveryEnabled:true,optedOut:false,phone:'+12025550123',sentToday:0,expired:false,claimed:false,committed:false};
 assert.equal(recoverySmsGate(input),null);
 for(const change of [{registered:false},{consent:false},{optedOut:true},{expired:true},{claimed:true},{committed:true},{sentToday:1}])assert.ok(recoverySmsGate({...input,...change}));
});
