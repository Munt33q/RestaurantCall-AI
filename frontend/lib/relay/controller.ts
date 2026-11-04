import type {LanguagePreference} from '../call-language';
import {voiceCopy} from '../voice-copy';
export type Prepared={speech:string;turn:number;preparedToken?:string};
export type RelayReply={reply:string;turn:number;deliveryId?:string;finished?:boolean;state?:unknown;phase?:string;requiresReadback?:boolean;languagePreference?:LanguagePreference;languageSelectionRequired?:boolean};
type Dependencies={send:(message:unknown)=>void;prepare:(speech:string,signal:AbortSignal)=>Promise<Prepared>;commit:(prepared:Prepared)=>Promise<RelayReply>;ack:(deliveryId:string,playedText:string)=>Promise<void>;interrupt:(heard:string,deliveryId?:string)=>Promise<void>;diagnostic?:(reason:string)=>void};
import {playbackMatches} from './playback';
export class RelayController{
 // No automatic thinking speech: it shares the provider's playback stream with
 // the financial review, adding latency and making acknowledgement ambiguous.
 private stopped=false;
 private language='en';
 private invalidation=0;
 private generation=0;private active:AbortController|null=null;private speculative:{speech:string;promise:Promise<Prepared>}|null=null;private lastFinal='';private lastFinalAt=0;private duplicateNoticeSent=false;private lastResult:RelayReply|null=null;private playing=false;private delivery:RelayReply|null=null;private played='';private writes:Promise<unknown>=Promise.resolve();private closed=false;private committing=false;private retryAfterReadback=false;
 constructor(private deps:Dependencies){}
 private invalidate(heard=''){this.invalidation++;this.retryAfterReadback=false;this.stopped=false;if(!this.committing&&!this.lastResult)this.lastFinal='';const deliveryId=this.delivery?.deliveryId;this.generation++;this.active?.abort();this.active=null;this.speculative=null;this.delivery=null;this.playing=false;this.played='';if(deliveryId)this.deps.diagnostic?.('playback_interrupted');const interrupted=this.deps.interrupt(heard,deliveryId);this.writes=Promise.allSettled([this.writes,interrupted]);}
 private async reconcilePlayback(){
  const delivery=this.delivery,epoch=this.generation;
  if(!delivery||!this.stopped||!playbackMatches(this.played,delivery.reply))return;
  this.delivery=null;
  const ack=this.writes.catch(()=>{}).then(async()=>{
   if(!delivery.deliveryId)throw Error('Missing delivery identity');
   await this.deps.ack(delivery.deliveryId,delivery.reply);
   if(epoch===this.generation&&delivery.requiresReadback)this.retryAfterReadback=true;
  });
  this.writes=ack;
  try{await ack;}catch{this.deps.diagnostic?.('playback_ack_failed');this.lastFinal='';return;}
  if(delivery.finished&&!this.closed&&epoch===this.generation)this.deps.send({type:'end',handoffData:JSON.stringify({reason:'order_complete'})});
 }
 async handle(message:any):Promise<void>{
  if(this.closed)return;
  if(message.type==='interrupt'){this.invalidate(String(message.utteranceUntilInterrupt??'').slice(0,1000));return;}
  if(message.type==='info'&&message.name==='clientSpeaking'&&message.value==='on'){if(this.active&&!this.playing)this.invalidate();return;}
  if(message.type==='turnResumed'){this.invalidation++;if(!this.committing&&!this.lastResult)this.lastFinal='';this.active?.abort();this.active=null;this.speculative=null;this.generation++;return;}
  if(message.type==='info'&&message.name==='tokensPlayed'){if(this.delivery){this.played+=String(message.value??'');await this.reconcilePlayback();}return;}
  if(message.type==='info'&&message.name==='agentSpeaking'){
   if(message.value==='on'){this.playing=true;this.stopped=false;return;}
   if(message.value==='off'){
    this.playing=false;this.stopped=true;
    if(this.delivery?.requiresReadback&&!playbackMatches(this.played,this.delivery.reply))this.deps.diagnostic?.(this.played?'playback_incomplete_or_mismatched':'playback_tokens_missing');
    await this.reconcilePlayback();
   }return;
  }
  if(message.type==='eagerEndOfTurn'&&typeof message.voicePrompt==='string'){
   if(this.speculative?.speech===message.voicePrompt)return;
   this.active?.abort();const abort=new AbortController();this.active=abort;
   const promise=this.writes.catch(()=>{}).then(()=>this.deps.prepare(message.voicePrompt.slice(0,1000),abort.signal));promise.catch(()=>{});this.speculative={speech:message.voicePrompt,promise};return;
  }
  if(message.type!=='prompt'||message.last!==true||typeof message.voicePrompt!=='string')return;
  const speech=message.voicePrompt.trim().slice(0,1000);if(!speech)return;
  // Serialize with acknowledgement before consuming this one review boundary.
  // It permits one caller retry of the same affirmative without depending on
  // an optional speaker-start event; duplicate frames remain suppressed.
  const invalidation=this.invalidation;await this.writes.catch(()=>{});if(this.closed||invalidation!==this.invalidation)return;
  if(this.retryAfterReadback){this.lastFinal='';this.retryAfterReadback=false;}
  if(speech===this.lastFinal&&((this.lastResult?.phase==='confirm'&&this.lastResult.requiresReadback)||(this.lastResult?.phase==='complete'&&this.lastResult.finished))&&Date.now()-this.lastFinalAt>=1500){this.deps.diagnostic?.(this.lastResult.phase==='complete'?'completed_receipt_retry':'confirmation_retry_requires_fresh_review');this.invalidate();await this.writes;this.lastFinal='';}
  if(speech===this.lastFinal){
   if(this.lastResult&&!this.duplicateNoticeSent&&Date.now()-this.lastFinalAt>=1500){this.duplicateNoticeSent=true;this.deps.send({type:'text',token:['complete','confirm','name','payment','payment_link','notification'].includes(this.lastResult.phase??'')?this.lastResult.reply:'If you want another of the same item, say add one more. Otherwise, tell me what you would like next.',last:true});}return;
  }
  this.lastFinal=speech;this.lastFinalAt=Date.now();this.duplicateNoticeSent=false;this.lastResult=null;
  const epoch=++this.generation;let abort=this.active;
  const speculative=this.speculative;const reuse=speculative&&speculative.speech===message.voicePrompt?speculative.promise:null;
  if(!reuse){abort?.abort();abort=new AbortController();this.active=abort;}
  try{
   await this.writes.catch(()=>{});
   const prepared=await (reuse??this.deps.prepare(speech,abort!.signal));
   if(this.closed||epoch!==this.generation||abort?.signal.aborted)return;
   this.committing=true;const commit=this.deps.commit(prepared).then(async result=>{if(this.lastFinal===speech)this.lastResult=result;if(epoch!==this.generation&&result.deliveryId)await this.deps.interrupt('',result.deliveryId);return result;}).finally(()=>{this.committing=false;});this.writes=commit;const result=await commit;
   if(this.closed||epoch!==this.generation)return;
   this.active=null;this.speculative=null;this.lastResult=result;this.delivery=result;this.played='';this.playing=true;this.stopped=false;
   // Telnyx keeps recognition active and can interrupt this playout at any point.
   if(result.languagePreference?.confirmed&&result.languagePreference.language!==this.language){this.language=result.languagePreference.language;this.deps.send({type:'language',ttsLanguage:this.language,transcriptionLanguage:this.language});}
   this.deps.send({type:'text',token:result.reply,last:true});
  }catch(error){if(this.lastFinal===speech&&!this.lastResult)this.lastFinal='';if(epoch===this.generation&&!abort?.signal.aborted&&!this.closed){this.active=null;this.deps.send({type:'text',token:voiceCopy(this.language,'outage'),last:true});}}
 }
 close(){this.invalidation++;this.closed=true;this.generation++;this.active?.abort();}
}
