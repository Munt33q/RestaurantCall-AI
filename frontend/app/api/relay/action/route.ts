import {recordEngagementEvents} from '@/lib/engagement/recovery-store';
import {uncertainSpeech,answerKind} from '@/lib/engagement/assistance';
import {recoveryEnabled,recoveryCode,recoveryConsent} from '@/lib/engagement/recovery-store';
import crypto from 'node:crypto';
import {verifyRelayToken,verifyRelayPayload,signRelayPayload} from '@/lib/relay-token';
import {client} from '@/lib/db/client';
import {salesVoiceContext,salesCallPrecontext,listMenu,restaurantTaxRate,voiceContext,processVoiceTurn,restaurantId} from '@/lib/repository';
import {understandVoiceTurn,type Understanding} from '@/lib/ai-menu';
import {decideTurn,initialState,type CartState} from '@/lib/voice-engine';
import {gateRelayCheckout} from '@/lib/relay/checkout';
import {processBackgroundJobs} from '@/lib/background-jobs';
import {waitUntil} from '@vercel/functions';
import {playbackMatches} from '@/lib/relay/playback';
export const maxDuration=30;
export async function POST(request:Request){
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';const grant=verifyRelayToken(token);
 if(!grant)return new Response('Unauthorized',{status:401});
 const body=await request.json().catch(()=>null);
 if(!body||!/^[-0-9a-f]{36}$/.test(body.connectionId??''))return new Response('Invalid connection',{status:400});
 const sql=client();
 try{
  if(grant.mode==='live'){
   if(body.action==='connect')await sql`INSERT INTO webhook_events(event_id,provider) VALUES(${`relay:${grant.nonce}`},${body.connectionId}) ON CONFLICT DO NOTHING`;
   const [claim]=await sql`SELECT provider FROM webhook_events WHERE event_id=${`relay:${grant.nonce}`}`;
   if(claim?.provider!==body.connectionId)return new Response('Connection already claimed or unknown',{status:409});
   const [active]=await sql`SELECT d.state_json->>'relayActiveNonce' AS nonce FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id WHERE s.provider_call_id=${grant.callId} AND s.restaurant_id=${restaurantId()}`;
   if(active?.nonce!==grant.nonce)return new Response('Superseded connection',{status:409});
  }
  if(body.action==='connect'){
   const state=grant.mode==='live'?await voiceContext(grant.callId):{...initialState(),turn:0,history:[]};
   if(!state)return new Response('Unknown call',{status:404});
   return Response.json({state,phase:state.phase,turn:state.turn});
  }
  if(body.action==='prepare'){
   if(typeof body.speech!=='string'||!body.speech.trim()||body.speech.length>1000)return new Response('Invalid speech',{status:400});
   const [stored,menu,taxRateBps]=await Promise.all([grant.mode==='live'?voiceContext(grant.callId):Promise.resolve(null),listMenu(),restaurantTaxRate()]);
   const context=grant.mode==='live'?stored:{...initialState(),...body.state,history:Array.isArray(body.history)?body.history.slice(-6):[],turn:body.turn??0,taxRateBps};
   if(!context||!Number.isInteger(context.turn)||context.turn<0||context.turn>100)return new Response('Invalid or expired call',{status:400});
   context.salesContext=grant.mode==='live'?await salesCallPrecontext(grant.callId,menu,context.languagePreference?.language??'en'):await salesVoiceContext(menu);
   const policyFast=recoveryConsent(body.speech)===false||context.phase==='ordering'&&((process.env.HESITATION_ASSIST_ENABLED==='true'&&(uncertainSpeech(body.speech)||(context.engagement?.assistance?.pending&&answerKind(body.speech))))||(process.env.UPSELL_ENABLED==='true'&&(context.engagement?.upsell?.pending||context.engagement?.upsell?.interrupted)&&answerKind(body.speech))||(recoveryEnabled()&&(recoveryCode(body.speech)||recoveryConsent(body.speech)!==null)));
   const interpreted=policyFast?{speech:body.speech,reasoningSource:'app'} as Understanding:await understandVoiceTurn(body.speech,menu,context,undefined,request.signal);
   if(interpreted.reasoningSource==='fallback')console.warn('Voice interpretation fallback',{phase:context.phase,reason:interpreted.diagnostics?.error??'invalid_model_output'});
   if(request.signal.aborted)return new Response('Cancelled',{status:499});
   const preparedToken=signRelayPayload({aud:'restaurant-call-relay-turn',grant:grant.nonce,callId:grant.callId,turn:context.turn,revision:context.relayRevision??0,requestId:crypto.randomUUID(),speech:body.speech,interpreted,previewState:grant.mode==='preview'?context:undefined,exp:Date.now()+45000});
   return Response.json({preparedToken,speech:body.speech,turn:context.turn});
  }
  if(body.action==='commit'){
   const prepared=typeof body.preparedToken==='string'?verifyRelayPayload(body.preparedToken):null;
   if(prepared?.aud!=='restaurant-call-relay-turn'||prepared.grant!==grant.nonce||prepared.callId!==grant.callId)return new Response('Invalid prepared turn',{status:401});
   const interpreted=prepared.interpreted as Understanding;
   if(grant.mode==='preview'){
    const [menu,taxRateBps]=await Promise.all([listMenu(),restaurantTaxRate()]);const current=prepared.previewState as CartState;
    const result=gateRelayCheckout(decideTurn(current,interpreted.speech,menu,taxRateBps,interpreted.extracted,interpreted.operation,undefined,interpreted),current.relayReviewReady===true,menu,taxRateBps);
    result.state.lastReply=result.reply;
    const deliveryId=crypto.randomUUID();result.state.relayDeliveryId=deliveryId;result.state.relayRequiresReadback=!interpreted.assistantReply&&result.reply.includes('Say confirm to place this order');result.state.relayReviewReady=result.state.phase==='confirm'&&!result.state.relayRequiresReadback&&result.state.quoteKey===current.quoteKey&&current.relayReviewReady===true;
    return Response.json({reply:result.reply,turn:prepared.turn+1,phase:result.state.phase,state:result.state,deliveryId,finished:result.endCall||result.submit||result.state.phase==='complete',requiresReadback:result.state.relayRequiresReadback});
   }
   const result=await processVoiceTurn({providerCallId:grant.callId,speech:prepared.speech,turn:prepared.turn,base:process.env.PUBLIC_APP_URL?.trim()||new URL(request.url).origin,interpretedSpeech:interpreted.speech,extracted:interpreted.extracted,operation:interpreted.operation,assistantReply:interpreted.assistantReply,offeredItemIds:interpreted.offeredItemIds,relay:{revision:prepared.revision,requestId:prepared.requestId,nonce:grant.nonce}});
   if(result.orderId)waitUntil(processBackgroundJobs(result.orderId));
   const context=result.phase?null:await voiceContext(grant.callId);
   return Response.json({...result,phase:result.phase??context?.phase,turn:result.turn??context?.turn});
  }
  if(body.action==='ack'||body.action==='interrupt'){
   if(grant.mode==='preview')return Response.json({ok:true});
   await sql.begin(async tx=>{
    const [row]=await tx`SELECT d.session_id,d.state_json FROM draft_carts d JOIN call_sessions s ON s.id=d.session_id WHERE s.provider_call_id=${grant.callId} AND s.restaurant_id=${restaurantId()} FOR UPDATE OF d`;
    if(!row)throw new Error('Unknown call');const state=row.state_json;if(state.relayActiveNonce!==grant.nonce)throw new Error('RELAY_STALE');
    if(body.action==='ack'){
     if(state.relayDeliveryId===body.deliveryId&&typeof body.playedText==='string'&&playbackMatches(body.playedText,state.lastReply??'')){
      if(state.relayOrderReceiptDeliveryId===body.deliveryId)state.relayCompletionPlayed=true;
      const offer=state.engagement?.upsell?.pending;if(offer)await recordEngagementEvents(tx,row.session_id,[{kind:'upsell_delivered',key:'delivered:'+offer.id,data:{offerId:offer.id}}]);
     }
     if(state.relayDeliveryId===body.deliveryId&&state.relayRequiresReadback&&typeof body.playedText==='string'&&playbackMatches(body.playedText,state.lastReply??''))state.relayReviewReady=true;
    }else{
     state.relayRevision=(state.relayRevision??0)+1;
     if(body.deliveryId&&state.relayDeliveryId===body.deliveryId){state.relayReviewReady=false;if(state.engagement){const pending=state.engagement.upsell.pending;if(pending)await recordEngagementEvents(tx,row.session_id,[{kind:'upsell_interrupted',key:'interrupted:'+pending.id,data:{offerId:pending.id}}]);state.engagement.upsell.interrupted=pending;state.engagement.upsell.pending=undefined;state.engagement.assistance.pending=false;}const heard=typeof body.heard==='string'?body.heard.slice(0,1000):'';state.lastReply=heard;await tx`UPDATE conversation_turns SET content=${heard||'[interrupted before playback]'} WHERE session_id=${row.session_id} AND sequence=${state.relayDeliveryTurn*2+1} AND role='assistant'`;}
    }
    await tx`UPDATE draft_carts SET state_json=${tx.json(state)},updated_at=now() WHERE session_id=${row.session_id}`;
   });return Response.json({ok:true});
  }
  return new Response('Unknown action',{status:400});
 }catch(error){return Response.json({error:error instanceof Error&&error.message==='RELAY_STALE'?'Stale interrupted turn':'Relay operation unavailable'},{status:error instanceof Error&&error.message==='RELAY_STALE'?409:503});}
}
