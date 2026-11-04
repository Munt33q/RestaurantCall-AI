import {languageAvailable} from '../relay/languages';
import {voiceCopy} from '../voice-copy';
import {preferenceTurn} from '../call-language';
import {normalizeCheckoutLanguage} from '../customer-languages';
import {engagementLanguage,engagementCopy} from './language';
import {decideTurn,type CartState,type MenuEntry} from '../voice-engine';
import type {Line} from '../order-contract';
import {answerKind,initialAssistance,observeAssistance,uncertainSpeech,type AssistanceState} from './assistance';
import {initialUpsell,authorizeUpsell,answerUpsell,type UpsellState} from './upsell';
export type EngagementState={assistance:AssistanceState;upsell:UpsellState;language?:string;recoveryClosed?:boolean};
export type EngagementEvent={kind:string;key:string;data:Record<string,unknown>};
type Options={metrics?:boolean;appSpeech:boolean;assistance:boolean;upsell:boolean;turn:number;interpretedSpeech?:string;extracted?:Line[];operation?:'set';menuCategory?:string;assistantReply?:string;offeredItemIds?:string[]};
export function engagementTurn(current:CartState,speech:string,menu:MenuEntry[],tax:number,options:Options){
 let state=structuredClone(current);const events:EngagementEvent[]=[];
 if(process.env.LANGUAGE_PREFERENCE_ENABLED==='true'||state.languagePreference){const preferred=preferenceTurn(state,speech);if(preferred.state.languagePreference?.confirmed&&preferred.state.languagePreference.language!==state.languagePreference?.language&&preferred.state.languagePreference.language!=='en'&&(!options.appSpeech||state.relayTransport!=='call-control'||!languageAvailable(preferred.state.languagePreference.language)))return {state,reply:voiceCopy(state.languagePreference?.language,'unsupported'),submit:false,endCall:false,engagementEvents:events};if(state.languagePreference?.confirmed&&state.languagePreference.revision!==preferred.state.languagePreference?.revision){preferred.state.relayReviewReady=false;preferred.state.quoteKey=undefined;}state=preferred.state;if(preferred.reply)return {state,reply:preferred.reply,submit:false,endCall:preferred.endCall,engagementEvents:events};}
 const active=options.appSpeech&&(options.assistance||options.upsell||options.metrics);
 if(!active)return {...decideTurn(state,options.interpretedSpeech??speech,menu,tax,options.extracted,options.operation,options.menuCategory,options),engagementEvents:events};
 state.engagement??={assistance:initialAssistance(),upsell:initialUpsell(),language:state.languagePreference?.language??'en'};
 events.push({kind:'engagement_cohort',key:'cohort',data:{upsellEnabled:options.upsell,assistanceEnabled:options.assistance}});
 if(state.phase==='ordering')events.push({kind:'browsing_turn',key:`browse:${options.turn}`,data:{}});
 const policy=state.engagement;policy.language=state.languagePreference?.language??engagementLanguage(speech,policy.language,state.phase);
 if(/^(?:start over|new order|no saved draft)$/i.test(speech.trim()))policy.recoveryClosed=true;
 const answer=answerKind(speech);
 const respond=(reply:string)=>({state,reply,submit:false,endCall:false,engagementEvents:events});
 const localized=normalizeCheckoutLanguage(speech,state);
 let extracted=options.extracted,text=localized!==speech?localized:options.interpretedSpeech??speech;
 if(state.phase==='ordering'&&policy.assistance.pending&&answer){
  policy.assistance.pending=false;
  if(answer==='no'){policy.assistance.declined=true;policy.upsell.declined=true;return respond(engagementCopy(policy.language,'decline'));}
  events.push({kind:'assistance_accepted',key:'assist-accepted',data:{}});
  const item=menu.find(m=>m.isAvailable&&(m.stockQty===null||m.stockQty>0));
  return respond(engagementCopy(policy.language,item?'suggest':'unavailable',item?.name));
 }
 if(state.phase==='ordering'&&(policy.upsell.pending||policy.upsell.interrupted)){
  const offerId=policy.upsell.pending?.id??policy.upsell.interrupted!.id;
  const result=answerUpsell(policy.upsell,speech);policy.upsell=result.state;
  if(result.declined){events.push({kind:'upsell_declined',key:`decline:${options.turn}`,data:{}});return respond(engagementCopy(policy.language,'decline'));}
  if(result.acceptedItemId){extracted=[{menuItemId:result.acceptedItemId,quantity:1}];text='add requested item';events.push({kind:'upsell_accepted',key:`accept:${options.turn}`,data:{itemId:result.acceptedItemId,offerId}});}
  else if(answer==='yes'&&policy.upsell.interrupted)return respond(engagementCopy(policy.language,'item'));
  else if(/\b(yes|no)\b/i.test(speech))return respond(engagementCopy(policy.language,'clarify'));
  else {policy.upsell.pending=undefined;policy.upsell.interrupted=undefined;}
 }
 const assistance=options.assistance?observeAssistance(policy.assistance,{id:options.turn,now:Date.now(),phase:state.phase,language:policy.language??'en',finalText:speech,callerSpeaking:false,agentSpeaking:false,providerHealthy:!options.assistantReply},{appSpeech:options.appSpeech,playback:false}):{state:policy.assistance,cue:null};
 policy.assistance=assistance.state;
 if(assistance.cue){events.push({kind:'assistance_offered',key:`assist:${options.turn}`,data:{}});return respond(assistance.cue);}
 const result=decideTurn(state,text,menu,tax,extracted,options.operation,options.menuCategory,{...options,assistantReply:extracted?undefined:options.assistantReply});
 if(result.state.engagement&&result.state.phase==='ordering'){
  const changed=result.state.items.some(l=>l.quantity>(current.items.find(c=>c.menuItemId===l.menuItemId)?.quantity??0));
  if(changed)result.state.engagement.recoveryClosed=true;
  const offered=authorizeUpsell(policy.upsell,{phase:result.state.phase,items:result.state.items,menu,requestId:`turn:${options.turn}`,language:policy.language??'en',appSpeech:options.appSpeech,hesitant:uncertainSpeech(speech),assisted:policy.assistance.offered,opportunity:changed?'added':'none'});
  result.state.engagement.upsell=offered.state;
  if(offered.offer)events.push({kind:'upsell_eligible',key:'eligible',data:{}});
  if(!options.upsell)result.state.engagement.upsell=policy.upsell;
  if(offered.offer&&options.upsell){result.reply=result.reply.replace(/ Anything else\?$/,'')+' '+offered.offer.text;events.push({kind:'upsell_offered',key:offered.offer.id,data:{category:offered.offer.category,itemId:offered.offer.itemId}});}
 }
 return {...result,engagementEvents:events};
}
