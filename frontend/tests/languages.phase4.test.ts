import test from 'node:test';import assert from 'node:assert/strict';
import {languagePreference,preferenceTurn,type CallLanguage} from '../lib/call-language';
import {languageFrame,relayDigits,speechProfiles} from '../lib/relay/languages';
import {liveVoiceProfile,BELLA_VOICE_ID} from '../lib/live-voice-profile';
import {decideTurn,initialState,parseMenuSpeech,readback,type CartState} from '../lib/voice-engine';
import {engagementTurn} from '../lib/engagement/turn';import {understandVoiceTurn} from '../lib/ai-menu';
// The existing server contract floors aggregate tax cents: $22.50 + $1.85.
const menu=[{id:'burger',name:'Classic Burger',aliases:['برگر','برجر','बर्गर','hamburguesa'],itemNumber:1,priceCents:1000,isAvailable:true,stockQty:10},{id:'fries',name:'Crispy Fries',aliases:['فرائز','بطاطا','फ्राइज','papas'],itemNumber:2,priceCents:250,isAvailable:true,stockQty:10}];
const cases:{language:CallLanguage;name:string;done:string;yes:string;cash:string;card:string;no:string;notes:string;confirm:string;total:string}[]=[
 {language:'en',name:'English',done:'done',yes:'yes',cash:'cash',card:'card',no:'no',notes:'no notes',confirm:'place it',total:'what is my total'},
 {language:'es',name:'español',done:'eso es todo',yes:'sí',cash:'efectivo',card:'tarjeta',no:'no',notes:'sin notas',confirm:'es correcto',total:'cuánto es el total'},
 {language:'ar',name:'العربية',done:'انتهيت',yes:'نعم',cash:'نقداً',card:'بطاقة',no:'لا',notes:'لا ملاحظات',confirm:'نفذ الطلب',total:'ما المجموع'},
 {language:'ur',name:'اردو',done:'یہ سب ہے',yes:'جی ہاں',cash:'نقد',card:'کارڈ',no:'نہیں',notes:'کوئی ہدایت نہیں',confirm:'آرڈر درج کریں',total:'کل رقم کتنی ہے'},
 {language:'hi',name:'हिंदी',done:'बस इतना ही',yes:'हाँ',cash:'नकद',card:'कार्ड',no:'नहीं',notes:'कोई नोट नहीं',confirm:'कर दीजिए',total:'कुल कितना है'},
];
for(const [index,c] of cases.entries()){
 test(`phase4 ${c.language}: spoken and keypad selection, stable preference and localized cash checkout`,()=>{
  assert.equal(languagePreference(undefined,c.name,true).language,c.language);
  const digit=relayDigits(String(index+1),'ordering',true);assert.equal(languagePreference(undefined,digit,true).language,c.language);
  let state:CartState={...initialState(),items:[{menuItemId:'burger',quantity:2},{menuItemId:'fries',quantity:1}],languagePreference:{language:c.language,confirmed:true,revision:1}};
  assert.deepEqual(languagePreference(state.languagePreference,'Spanish rice please'),state.languagePreference);
  const question=decideTurn(state,c.total,menu,825);assert.match(question.reply,/\$24\.35/);assert.equal(question.state.phase,'ordering');
  let r=decideTurn(state,c.done,menu,825);assert.equal(r.state.phase,'name');
  r=decideTurn(r.state,c.language==='ur'?'میرا نام علی ہے':'Alex',menu,825);assert.ok(r.state.customerName);assert.equal(r.state.nameConfirmed,false);
  r=decideTurn(r.state,c.yes,menu,825);assert.equal(r.state.phase,'payment');
  r=decideTurn(r.state,c.cash,menu,825);assert.equal(r.state.phase,'notification');r=decideTurn(r.state,c.no,menu,825);assert.equal(r.state.notificationConsent,false);assert.equal(r.state.phase,'notes');
  r=decideTurn(r.state,c.notes,menu,825);assert.equal(r.state.phase,'confirm');assert.equal(r.reviewRequired,true);assert.match(r.reply,/2 Classic Burger, 1 Crispy Fries/);assert.match(r.reply,/\$24\.35/);
  if(c.language!=='en')assert.doesNotMatch(r.reply,/Say confirm|Payment cash|Total including/);
  const reviewed=r.state;r=decideTurn(reviewed,c.confirm,menu,825);assert.equal(r.submit,true);assert.equal(r.state.phase,'complete');
  const changed=decideTurn(reviewed,c.confirm,menu.map(m=>({...m,priceCents:m.priceCents+1})),825);assert.equal(changed.submit,false);assert.equal(changed.checkoutRejection,'quote_changed');assert.equal(changed.reviewRequired,true);
 });
 test(`phase4 ${c.language}: card and notification permissions remain explicit`,()=>{
  let r=decideTurn({...initialState(),phase:'payment',languagePreference:{language:c.language,confirmed:true,revision:1}},c.card,menu,825);assert.equal(r.state.phase,'payment_link');
  r=decideTurn(r.state,'maybe',menu,825);assert.equal(r.state.paymentLinkSmsConsent,undefined);
  r=decideTurn(r.state,c.no,menu,825);assert.equal(r.state.paymentLinkSmsConsent,false);assert.equal(r.state.phase,'notification');
  r=decideTurn(r.state,'maybe',menu,825);assert.equal(r.state.notificationConsent,undefined);
  r=decideTurn(r.state,c.no,menu,825);assert.equal(r.state.notificationConsent,false);
 });
}
test('phase4 Unicode catalog aliases and compound quantities work without a model',async()=>{
 const before=global.fetch;global.fetch=async()=>{throw Error('Known catalog additions must not need a model');};
 try{for(const speech of ['دو برگر اور تین فرائز','दो बर्गर और तीन फ्राइज','dos hamburguesa y tres papas','two Classic Burger and three Crispy Fries']){const u=await understandVoiceTurn(speech,menu,{...initialState(),history:[]});assert.equal(u.reasoningSource,'app',speech);assert.deepEqual(u.extracted,[{menuItemId:'burger',quantity:2},{menuItemId:'fries',quantity:3}],speech);}assert.deepEqual(parseMenuSpeech('۲ برگر',menu),[{menuItemId:'burger',quantity:2}]);}finally{global.fetch=before;}
});
test('phase4 unclear selections are bounded and switches cannot silently select Urdu as Hindi',()=>{
 let state:any={};for(let i=0;i<3;i++){const r=preferenceTurn(state,'Spanish or Urdu');state=r.state;assert.equal(r.endCall,i===2);}
 const en={language:'en' as const,confirmed:true,revision:1};assert.deepEqual(languagePreference(en,'do not speak Urdu'),en);assert.deepEqual(languagePreference(en,'say "switch to Urdu"'),en);
 assert.equal(languagePreference(en,'اردو میں بات کریں').language,'ur');
 assert.equal(relayDigits('4','ordering',false),'item 4');assert.equal(relayDigits('5','confirm',false),'');
});
test('phase4 unsupported provider languages preserve the cart and prior language',()=>{
 const old=process.env.VOICE_LANGUAGE_PROFILES_JSON;delete process.env.VOICE_LANGUAGE_PROFILES_JSON;
 try{const state={...initialState(),items:[{menuItemId:'burger',quantity:1}],languagePreference:{language:'en' as const,confirmed:true,revision:1}};const r=engagementTurn(state,'switch to Urdu',menu,825,{appSpeech:true,assistance:false,upsell:false,turn:1});assert.deepEqual(r.state,state);assert.match(r.reply,/not verified/);assert.throws(()=>languageFrame('ur'),/not verified/);}finally{if(old!==undefined)process.env.VOICE_LANGUAGE_PROFILES_JSON=old;}
});
test('phase4 language profile drives both synthesis and recognition and rejects English Flux for Urdu',()=>{
 const old=process.env.VOICE_LANGUAGE_PROFILES_JSON;
 const profile={language:'ur',voice:'Telnyx.Sukhan.news-reader',tts_provider:'telnyx',transcription_engine:'Speechmatics',transcription_engine_config:{transcription_model:'fixture-model'},evidenceRef:'synthetic-fixture-not-provider-acceptance'};
 try{process.env.VOICE_LANGUAGE_PROFILES_JSON=JSON.stringify([profile]);assert.equal(speechProfiles()[0].language,'ur');assert.deepEqual(languageFrame('ur'),{type:'language',ttsLanguage:'ur',transcriptionLanguage:'ur'});
  process.env.VOICE_LANGUAGE_PROFILES_JSON=JSON.stringify([{...profile,transcription_engine_config:{transcription_model:'deepgram/flux'}}]);assert.throws(speechProfiles,/English Flux/);
  process.env.VOICE_LANGUAGE_PROFILES_JSON=JSON.stringify([{...profile,voice:'ElevenLabs.eleven_flash_v2_5.syntheticVoiceId123456'}]);assert.throws(speechProfiles,/Urdu/);
 }finally{if(old===undefined)delete process.env.VOICE_LANGUAGE_PROFILES_JSON;else process.env.VOICE_LANGUAGE_PROFILES_JSON=old;}
});
test('phase4 configured Call Control language cannot activate on TeXML, Gather or an unknown transport',()=>{
 const old=process.env.VOICE_LANGUAGE_PROFILES_JSON;
 process.env.VOICE_LANGUAGE_PROFILES_JSON=JSON.stringify([{language:'ur',voice:'Telnyx.Sukhan.news-reader',tts_provider:'telnyx',transcription_engine:'Speechmatics',transcription_engine_config:{transcription_model:'fixture-model'},evidenceRef:'synthetic-fixture-not-provider-acceptance'}]);
 const current:CartState={...initialState(),items:[{menuItemId:'burger',quantity:1}],languagePreference:{language:'en',confirmed:true,revision:1},relayReviewReady:true,quoteKey:'synthetic-quote'};
 const options={appSpeech:true,assistance:false,upsell:false,turn:1};
 try{
  for(const transport of [undefined,'texml'] as const){const state={...current,relayTransport:transport};const r=engagementTurn(state,'switch to Urdu',menu,825,options);assert.deepEqual(r.state,state);assert.match(r.reply,/not verified/);}
  const gather={...current,relayTransport:'call-control' as const};assert.deepEqual(engagementTurn(gather,'switch to Urdu',menu,825,{...options,appSpeech:false}).state,gather);
  const allowed=engagementTurn(gather,'switch to Urdu',menu,825,options);assert.equal(allowed.state.languagePreference?.language,'ur');assert.equal(allowed.state.relayReviewReady,false);assert.equal(allowed.state.quoteKey,undefined);assert.deepEqual(allowed.state.items,current.items);
 }finally{if(old===undefined)delete process.env.VOICE_LANGUAGE_PROFILES_JSON;else process.env.VOICE_LANGUAGE_PROFILES_JSON=old;}
});
test('phase4 Brittany is never guessed or silently substituted; Bella rollback remains exact',()=>{
 const keys=['ELEVENLABS_VOICE_PREFERENCE','ELEVENLABS_BRITTANY_VOICE_ID','ELEVENLABS_BRITTANY_VERIFIED_LANGUAGES','ELEVENLABS_VOICE_ID'];const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{process.env.ELEVENLABS_VOICE_PREFERENCE='brittany';delete process.env.ELEVENLABS_BRITTANY_VOICE_ID;assert.throws(()=>liveVoiceProfile(),/not verified/);
  process.env.ELEVENLABS_BRITTANY_VOICE_ID='syntheticBrittanyFixture123';process.env.ELEVENLABS_BRITTANY_VERIFIED_LANGUAGES='en,es';assert.equal(liveVoiceProfile().name,'Brittany');assert.throws(()=>liveVoiceProfile('ur'),/not verified/);
  process.env.ELEVENLABS_VOICE_PREFERENCE='bella';assert.equal(liveVoiceProfile().id,BELLA_VOICE_ID);assert.equal(liveVoiceProfile().model,'eleven_flash_v2_5');
 }finally{for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
test('phase4 review metadata is independent of English wording',()=>{
 for(const c of cases){const s={...initialState(),phase:'notes' as const,items:[{menuItemId:'burger',quantity:1}],customerName:'Alex',paymentMethod:'cash' as const,languagePreference:{language:c.language,confirmed:true,revision:1}};const r=decideTurn(s,c.notes,menu,825);assert.equal(r.reviewRequired,true);assert.equal(r.reply,readback(r.state,menu,825));}
});
test('phase4 native menu and availability questions use verified catalog facts in the chosen language',async()=>{
 const old=global.fetch;global.fetch=async()=>{throw Error('Known availability should not call a model');};
 try{for(const [language,speech] of [['es','tienen hamburguesa'],['ar','هل لديكم برجر'],['ur','کیا برگر ہے؟'],['hi','क्या बर्गर है?']] as const){
  const state={...initialState(),languagePreference:{language,confirmed:true,revision:1},history:[]};const u=await understandVoiceTurn(speech,menu,state);assert.equal(u.reasoningSource,'app',speech);assert.match(u.assistantReply!,/Classic Burger/);assert.match(u.assistantReply!,/\$10\.00/);assert.doesNotMatch(u.assistantReply!,/Yes, we have|Would you/);assert.deepEqual(u.offeredItemIds,['burger']);
 }}finally{global.fetch=old;}
});
