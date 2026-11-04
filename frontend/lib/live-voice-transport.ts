import {languageQuestion} from './call-language';
import {speechProfiles} from './relay/languages';
import crypto from 'node:crypto';
import {liveVoiceProfile} from './live-voice-profile';

export type VoiceDependencies={connectionId:string;number:string;socketUrl:string;secretRef:string;acceptancePhone?:string;
 open:(id:string,phone:string)=>Promise<void>;admitted:(id:string,phone:string)=>Promise<boolean>;token:(id:string)=>Promise<string>;
 command:(id:string,action:string,body:Record<string,unknown>)=>Promise<void>;
 ended:(id:string,status:string)=>Promise<void>};
type VoiceEvent={id?:string;event_type?:string;payload?:Record<string,unknown>};
const outageState=Buffer.from('restaurantcall:relay-outage').toString('base64');
const outageCommand=(commandId:string)=>({command_id:commandId,payload:'Sorry, the ordering connection was interrupted. Please call again or contact the restaurant to check whether your order was placed.',voice:'Telnyx.Natural.abbie',client_state:outageState});
export async function handleLiveVoiceEvent(event:VoiceEvent,deps:VoiceDependencies){
 const p=event.payload??{},id=p.call_control_id;
 if(typeof id!=='string'||!id||id.length>256||!deps.connectionId||p.connection_id!==deps.connectionId)return {ignored:true};
 const commandId=crypto.createHash('sha256').update(id+':'+event.event_type).digest('hex');
 // speak.ended has no from/to. This signed event is scoped to our dedicated
 // application and to the client_state set by the outage command below.
 if(event.event_type==='call.speak.ended'&&p.client_state===outageState){await deps.command(id,'hangup',{command_id:commandId});return {received:true};}
 if(p.to!==deps.number)return {ignored:true};
 if(event.event_type==='call.conversation.ended'){
  if(p.reason==='customer_disconnect'){
   console.error('LIVE_VOICE_FAILURE',{reason:'customer_disconnect'});
   await deps.command(id,'speak',outageCommand(commandId));
  }else await deps.command(id,'hangup',{command_id:commandId});
  return {received:true};
 }
 if(!['call.initiated','call.answered','call.hangup'].includes(event.event_type??''))return {ignored:true};
 if(event.event_type==='call.hangup'){await deps.ended(id,'completed');return {received:true};}
 if(event.event_type==='call.initiated'&&!['incoming','inbound'].includes(String(p.direction)))return {ignored:true};
 if(event.event_type==='call.answered'&&p.direction!==undefined&&!['incoming','inbound'].includes(String(p.direction)))return {ignored:true};
 if(deps.acceptancePhone&&p.from!==deps.acceptancePhone){
  if(event.event_type==='call.initiated')await deps.command(id,'answer',{command_id:commandId});
  else await deps.command(id,'speak',{command_id:commandId,payload:'The ordering connection is undergoing a brief test. Please call again shortly.',voice:'Telnyx.Natural.abbie',client_state:outageState});
  return {received:true};
 }
 if(!deps.connectionId||!deps.secretRef||!deps.socketUrl)throw Error('Live voice configuration is incomplete');
 const url=new URL(deps.socketUrl);if(url.protocol!=='wss:')throw Error('Live voice configuration requires WSS');
 if(typeof p.from!=='string'||!/^\+[1-9]\d{7,14}$/.test(p.from))throw Error('Invalid caller');
 // Telnyx only includes direction on initiated. An answered event must belong
 // to the inbound session admitted before we issued the answer command.
 if(event.event_type==='call.answered'&&!await deps.admitted(id,p.from))return {ignored:true};
 await deps.open(id,p.from);
 // Stable command IDs make Telnyx webhook retries safe without losing failed commands.
 if(event.event_type==='call.initiated'){await deps.command(id,'answer',{command_id:commandId});return {received:true};}
 url.searchParams.set('token',await deps.token(id));
 const profiles=process.env.LANGUAGE_PREFERENCE_ENABLED==='true'?speechProfiles():[];
 const profile=liveVoiceProfile();
 try{await deps.command(id,'conversation_relay_start',{
  command_id:commandId,url:url.toString(),
  voice:`ElevenLabs.${profile.model}.${profile.id}`,
  voice_settings:{type:'elevenlabs',api_key_ref:deps.secretRef},
  ...(profiles.length?{languages:profiles.map(({evidenceRef,...entry})=>({...entry,voice_settings:entry.tts_provider==='elevenlabs'?{type:'elevenlabs',api_key_ref:deps.secretRef}:{type:entry.tts_provider}}))}:{}),
  language:'en',greeting:deps.acceptancePhone?'RestaurantCall AI. This is the final live-order acceptance test. Test orders reach the portal but must not be prepared. How can I help you?':process.env.LANGUAGE_PREFERENCE_ENABLED==='true'?languageQuestion:'RestaurantCall AI. How can I help you today? How are you doing?',
  transcription_engine:'Deepgram',transcription_engine_config:{transcription_model:'deepgram/flux',interim_results:true,eot_threshold:0.7,eager_eot_threshold:0.4},
  interruptible:'speech',interruptible_greeting:'speech',dtmf_detection:true,
  // Call Control rejects the TeXML-only events attribute (422 /events).
  // Missing playback proof remains fail-closed in gateRelayCheckout.
 });}catch(error){try{await deps.command(id,'speak',outageCommand(commandId+'-outage'));}catch{console.error('LIVE_VOICE_FAILURE',{reason:'outage_announcement_failed'});}throw error;}
 return {received:true};
}
