import type {CallLanguage} from '../call-language';
import {languageDigits} from '../call-language';
export type SpeechProfile={language:CallLanguage;voice:string;tts_provider:string;transcription_engine:string;transcription_engine_config:{transcription_model:string};evidenceRef:string};
// Configuration is a release input, not proof of PSTN acceptance. Leave empty
// until account voice, model, STT and real audio have all been verified.
export function speechProfiles():SpeechProfile[]{
 const raw=process.env.VOICE_LANGUAGE_PROFILES_JSON;if(!raw)return [];
 const rows=JSON.parse(raw);if(!Array.isArray(rows)||rows.length>5)throw Error('Invalid voice language profiles');
 const seen=new Set<string>();
 return rows.map((p:any)=>{
  if(!['en','es','ar','ur','hi'].includes(p.language)||seen.has(p.language)||typeof p.voice!=='string'||!/^[A-Za-z0-9_.:-]{3,180}$/.test(p.voice)||!['elevenlabs','telnyx','azure','aws','resemble'].includes(p.tts_provider)||!['Deepgram','Google','Telnyx','Azure','Speechmatics','Soniox','AssemblyAI'].includes(p.transcription_engine)||!/^[-\w/.]{2,100}$/.test(p.transcription_engine_config?.transcription_model??'')||typeof p.evidenceRef!=='string'||!/^[\w./-]{4,200}$/.test(p.evidenceRef))throw Error('Unverified or invalid language profile');
  if(p.language!=='en'&&p.transcription_engine_config.transcription_model==='deepgram/flux')throw Error('English Flux must not be reused for an unverified language');
  if(p.language==='ur'&&/^ElevenLabs\.eleven_(?:flash|turbo)_v2_5\./i.test(p.voice))throw Error('Urdu requires a separately verified synthesis model');
  seen.add(p.language);return {language:p.language,voice:p.voice,tts_provider:p.tts_provider,transcription_engine:p.transcription_engine,transcription_engine_config:{transcription_model:p.transcription_engine_config.transcription_model},evidenceRef:p.evidenceRef};
 });
}
export function languageAvailable(language:CallLanguage){return language==='en'||speechProfiles().some(p=>p.language===language);}
export function languageFrame(language:CallLanguage){
 if(!languageAvailable(language))throw Error('Spoken language not verified');
 return {type:'language',ttsLanguage:language,transcriptionLanguage:language};
}
export function relayDigits(value:string,phase:string,selectionRequired=false){
 if(selectionRequired){const language=languageDigits[value];return language?({en:'English',es:'Spanish',ar:'Arabic',ur:'Urdu',hi:'Hindi'}[language]):'';}
 return phase==='payment_link'?({'1':'yes','2':'no'}[value]??''):phase==='notification'?({'1':'text','2':'call','3':'none'}[value]??''):phase==='name'?({'1':'yes','2':'no'}[value]??''):phase==='payment'?({'1':'cash','2':'card'}[value]??''):phase==='confirm'?({'1':'confirm','2':'change order','9':'cancel'}[value]??''):phase==='ordering'?(value==='0'?'menu':/^\d{1,2}$/.test(value)?`item ${Number(value)}`:''):'';
}
