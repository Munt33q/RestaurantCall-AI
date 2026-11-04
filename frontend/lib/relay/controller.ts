export type Prepared={speech:string;turn:number;preparedToken?:string};
export type RelayReply={reply:string;turn:number;deliveryId?:string;finished?:boolean;state?:unknown;phase?:string;requiresReadback?:boolean};
type Dependencies={send:(message:unknown)=>void;prepare:(speech:string,signal:AbortSignal)=>Promise<Prepared>;commit:(prepared:Prepared)=>Promise<RelayReply>;ack:(deliveryId:string,playedText:string)=>Promise<void>;interrupt:(heard:string,deliveryId?:string)=>Promise<void>};
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
export class RelayController{
 private cueSent=false;private cuePlayed='';
 private waitTimer:ReturnType<typeof setTimeout>|null=null;
 private clearWait(){if(this.waitTimer)clearTimeout(this.waitTimer);this.waitTimer=null;}
 private generation=0;private active:AbortController|null=null;private speculative:{speech:string;promise:Promise<Prepared>}|null=null;private lastFinal='';private lastFinalAt=0;private duplicateNoticeSent=false;private lastResult:RelayReply|null=null;private playing=false;private delivery:RelayReply|null=null;private played='';private writes:Promise<unknown>=Promise.resolve();private closed=false;private committing=false;private retryAfterReadback=false;
 constructor(private deps:Dependencies){}
 private invalidate(heard=''){this.clearWait();this.cueSent=false;this.cuePlayed='';if(!this.committing&&!this.lastResult)this.lastFinal='';const deliveryId=this.delivery?.deliveryId;this.generation++;this.active?.abort();this.active=null;this.speculative=null;this.delivery=null;this.playing=false;this.played='';const interrupted=this.deps.interrupt(heard,deliveryId);this.writes=Promise.allSettled([this.writes,interrupted]);}
 async handle(message:any):Promise<void>{
  if(this.closed)return;
  if(message.type==='interrupt'){this.invalidate(String(message.utteranceUntilInterrupt??'').slice(0,1000));return;}
  if(message.type==='info'&&message.name==='clientSpeaking'&&message.value==='on'){if(this.retryAfterReadback){this.lastFinal='';this.retryAfterReadback=false;}if(this.active&&!this.playing)this.invalidate();return;}
  if(message.type==='turnResumed'){this.clearWait();this.cueSent=false;this.cuePlayed='';if(!this.committing&&!this.lastResult)this.lastFinal='';this.active?.abort();this.active=null;this.speculative=null;this.generation++;return;}
  if(message.type==='info'&&message.name==='tokensPlayed'){if(this.delivery)this.played+=String(message.value??'');else if(this.cueSent)this.cuePlayed+=String(message.value??'');return;}
  if(message.type==='info'&&message.name==='agentSpeaking'){
   if(message.value==='on'){this.playing=true;return;}
   if(message.value==='off'){
    this.playing=false;const delivery=this.delivery;const epoch=this.generation;
    if(delivery&&(normalize(this.played)===normalize(delivery.reply)||this.cueSent&&normalize(this.played)===normalize('Let me check that for you.'+delivery.reply))){
     this.delivery=null;if(delivery.requiresReadback)this.retryAfterReadback=true;
     const played=delivery.reply;this.cueSent=false;this.cuePlayed='';if(delivery.deliveryId)this.writes=this.writes.catch(()=>{}).then(()=>this.deps.ack(delivery.deliveryId!,played));
     await this.writes;
     if(delivery.finished&&!this.closed&&epoch===this.generation){await this.writes;if(this.closed||epoch!==this.generation)return;this.deps.send({type:'end',handoffData:JSON.stringify({reason:'order_complete'})});}
    }
   }return;
  }
  if(message.type==='eagerEndOfTurn'&&typeof message.voicePrompt==='string'){
   if(this.speculative?.speech===message.voicePrompt)return;
   this.active?.abort();const abort=new AbortController();this.active=abort;
   const promise=this.writes.catch(()=>{}).then(()=>this.deps.prepare(message.voicePrompt.slice(0,1000),abort.signal));promise.catch(()=>{});this.speculative={speech:message.voicePrompt,promise};return;
  }
  if(message.type!=='prompt'||message.last!==true||typeof message.voicePrompt!=='string')return;
  const speech=message.voicePrompt.trim().slice(0,1000);if(!speech)return;
  if(speech===this.lastFinal){
   if(this.lastResult&&!this.duplicateNoticeSent&&Date.now()-this.lastFinalAt>=1500){this.duplicateNoticeSent=true;this.deps.send({type:'text',token:this.lastResult.phase==='complete'?'Your order is already placed. Thank you.':this.lastResult.phase==='confirm'?'Please say yes confirm to place the reviewed order, or change order.':['name','payment','payment_link','notification'].includes(this.lastResult.phase??'')?this.lastResult.reply:'If you want another of the same item, say add one more. Otherwise, tell me what you would like next.',last:true});}return;
  }
  this.lastFinal=speech;this.lastFinalAt=Date.now();this.duplicateNoticeSent=false;this.lastResult=null;
  const epoch=++this.generation;let abort=this.active;
  const speculative=this.speculative;const reuse=speculative&&speculative.speech===message.voicePrompt?speculative.promise:null;
  if(!reuse){abort?.abort();abort=new AbortController();this.active=abort;}
  this.clearWait();this.waitTimer=setTimeout(()=>{this.waitTimer=null;if(!this.closed&&epoch===this.generation&&!abort?.signal.aborted){this.cueSent=true;this.cuePlayed='';this.delivery=null;this.deps.send({type:'text',token:'Let me check that for you.',last:true});}},1200);
  try{
   await this.writes.catch(()=>{});
   const prepared=await (reuse??this.deps.prepare(speech,abort!.signal));
   if(this.closed||epoch!==this.generation||abort?.signal.aborted)return;
   this.committing=true;const commit=this.deps.commit(prepared).then(async result=>{if(this.lastFinal===speech)this.lastResult=result;if(epoch!==this.generation&&result.deliveryId)await this.deps.interrupt('',result.deliveryId);return result;}).finally(()=>{this.committing=false;});this.writes=commit;const result=await commit;
   if(this.closed||epoch!==this.generation)return;
   this.clearWait();this.active=null;this.speculative=null;this.lastResult=result;this.delivery=result;this.played=this.cueSent?this.cuePlayed:'';this.playing=true;
   // Telnyx keeps recognition active and can interrupt this playout at any point.
   this.deps.send({type:'text',token:result.reply,last:true});
  }catch(error){if(epoch===this.generation){this.clearWait();this.cueSent=false;this.cuePlayed='';}if(this.lastFinal===speech&&!this.lastResult)this.lastFinal='';if(epoch===this.generation&&!abort?.signal.aborted&&!this.closed){this.active=null;this.deps.send({type:'text',token:'The connection paused for a moment. Please say that again.',last:true});}}
 }
 close(){this.clearWait();this.closed=true;this.generation++;this.active?.abort();}
}
