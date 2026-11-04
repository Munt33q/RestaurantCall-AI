export type AssistanceState={offered:boolean;declined:boolean;uncertainTurns:number;lastEvent:number;pending?:boolean};
export const initialAssistance=():AssistanceState=>({offered:false,declined:false,uncertainTurns:0,lastEvent:-1});
export const normalized=(s:string)=>s.normalize('NFC').toLowerCase().trim().replace(/[.!?؟।،]+$/u,'').replace(/\s+/g,' ');
export function uncertainSpeech(s:string){return /^(?:(?:um|uh|hmm|erm|eh|em|امم|همم|हम्म|उम्म)[ ,.]*)+$|^(?:let me see|let me think|no sé|déjame pensar|لا أعرف|دعني أفكر|मुझे सोचने दो)$/iu.test(s.trim());}
export function answerKind(s:string):'yes'|'no'|null{const t=normalized(s);return ['yes','yes please','جی ہاں','ہاں','sí','si','نعم','أجل','हाँ','हां'].includes(t)?'yes':['no','no thanks','نہیں','نہیں شکریہ','no thank you','no gracias','لا','لا شكرا','नहीं','नही'].includes(t)?'no':null;}
const cues:Record<string,string>={en:'No rush. Would you like a suggestion?',es:'Sin prisa. ¿Le gustaría una sugerencia?',ar:'خذ وقتك. هل تريد اقتراحا؟',ur:'آرام سے۔ کیا آپ کوئی تجویز چاہیں گے؟',hi:'आराम से बताइए। क्या आप कोई सुझाव चाहेंगे?'};
export type AssistanceEvent={id:number;now:number;phase:string;language:string;finalText:string;idle?:boolean;callerSpeaking:boolean;agentSpeaking:boolean;providerHealthy:boolean;playbackEndedAt?:number};
export function observeAssistance(current:AssistanceState,event:AssistanceEvent,caps:{appSpeech:boolean;playback:boolean}){
 const state=structuredClone(current);let cue:string|null=null;
 if(event.id<=state.lastEvent)return {state,cue};state.lastEvent=event.id;
 if(!caps.appSpeech||event.phase!=='ordering'||event.callerSpeaking||event.agentSpeaking||!event.providerHealthy||state.offered||state.declined)return {state,cue};
 const idle=event.idle===true&&caps.playback&&Number.isFinite(event.playbackEndedAt)&&event.now-event.playbackEndedAt!>=6000;
 // Silence is distinct from a caller finishing a filler-only turn.
 if(!event.idle)state.uncertainTurns=uncertainSpeech(event.finalText)?state.uncertainTurns+1:0;
 if(idle||state.uncertainTurns>=2){state.offered=true;state.pending=true;cue=cues[event.language]??cues.en;}
 return {state,cue};
}
