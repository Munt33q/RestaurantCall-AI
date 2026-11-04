import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixture,databaseEnabled} from './helpers/postgres';
import {openVoiceSession} from '../lib/repository';
import {bindElevenLabsConversation} from '../lib/elevenlabs-session';
import {runElevenLabsTool,ToolError} from '../lib/elevenlabs-tools';

test('ElevenLabs tools require an active bound session and return authoritative menu data',{skip:!databaseEnabled},async t=>{
 const {sql,item}=await fixture(t);const call='phase5-'+crypto.randomUUID();await openVoiceSession(call,'+12025550123','https://synthetic.test');
 await assert.rejects(()=>runElevenLabsTool({tool:'search_menu',conversation_id:'conv_unbound12345',query:'Classic'}), (error:any)=>error instanceof ToolError&&error.status===409);
 await bindElevenLabsConversation({conversationId:'conv_phase5fixture123',providerCallId:call});
 const result:any=await runElevenLabsTool({tool:'search_menu',conversation_id:'conv_phase5fixture123',query:'Classic'});
 assert.equal(result.ok,true);assert.equal(result.matches[0].id,item);assert.equal(result.matches[0].priceCents,1000);
 const details:any=await runElevenLabsTool({tool:'set_customer_details',conversation_id:'conv_phase5fixture123',customer_name:'Alex',customer_phone:'+12025550123',name_confirmed:true});
 assert.equal(details.nameConfirmed,true);assert.equal(details.hasCallbackNumber,true);
 const preference:any=await runElevenLabsTool({tool:'set_notification_preference',conversation_id:'conv_phase5fixture123',channel:'sms',consent:true});
 assert.equal(preference.deliveryEnabled,false);assert.equal(preference.consentRecordedProvisionally,true);
 const cart:any=await runElevenLabsTool({tool:'get_cart',conversation_id:'conv_phase5fixture123'});
 assert.deepEqual(cart.cart,[]);assert.equal(cart.notificationChannel,'sms');assert.equal(cart.customerName,'Alex');
 [await sql`UPDATE call_sessions SET expires_at=now()-interval '1 minute' WHERE provider_call_id=${call}`];
 await assert.rejects(()=>runElevenLabsTool({tool:'get_cart',conversation_id:'conv_phase5fixture123'}), (error:any)=>error instanceof ToolError&&error.status===409);
});
