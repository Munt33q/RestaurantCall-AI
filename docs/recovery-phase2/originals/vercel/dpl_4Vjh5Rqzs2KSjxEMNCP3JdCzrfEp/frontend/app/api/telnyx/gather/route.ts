import {processVoiceTurn,listMenu,voiceContext} from '@/lib/repository';
import {verifyTelnyxWebhook} from '@/lib/telnyx';
import {understandVoiceTurn} from '@/lib/ai-menu';
import {waitUntil} from '@vercel/functions';
import {processBackgroundJobs} from '@/lib/background-jobs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function POST(request:Request){
 const raw=await request.text();
 if(!process.env.TELNYX_PUBLIC_KEY?.trim())return new Response('Telnyx webhook verification is not configured',{status:503});
 if(!verifyTelnyxWebhook(raw,request.headers.get('telnyx-signature-ed25519'),request.headers.get('telnyx-timestamp')))return new Response('Unauthorized',{status:401});
 const form=new URLSearchParams(raw);const id=form.get('CallSid')||form.get('CallControlId');
 const turnText=new URL(request.url).searchParams.get('turn');const turn=Number(turnText);
 if(!id||turnText===null||!/^\d+$/.test(turnText)||!Number.isSafeInteger(turn)||turn>100)return new Response('Invalid call or turn identifier',{status:400});
 let speech=(form.get('SpeechResult')||form.get('speech_result')||'').slice(0,1000);
 try{
  const [context,menu]=await Promise.all([voiceContext(id),listMenu()]);
  const digits=form.get('Digits');
  if(digits&&/^\d{1,2}$/.test(digits)){
   speech=context?.phase==='payment_link'?({'1':'yes','2':'no'}[digits]??''):context?.phase==='notification'?({'1':'text','2':'call','3':'none'}[digits]??''):context?.phase==='name'?({'1':'yes','2':'no'}[digits]??''):context?.phase==='payment'?({'1':'cash','2':'card'}[digits]??''):context?.phase==='confirm'?({'1':'confirm','2':'change order','9':'cancel'}[digits]??''):context?.phase==='ordering'?(digits==='0'?'menu':`item ${Number(digits)}`):'';
  }
  const interpreted=context?await understandVoiceTurn(speech,menu,context):{speech};
  const result=await processVoiceTurn({providerCallId:id,phone:form.get('From')??undefined,speech,turn,base:process.env.PUBLIC_APP_URL?.trim()||new URL(request.url).origin,extracted:interpreted.extracted,interpretedSpeech:interpreted.speech,operation:interpreted.operation,menuCategory:interpreted.menuCategory,assistantReply:interpreted.assistantReply,offeredItemIds:interpreted.offeredItemIds});
  if(result.orderId)waitUntil(processBackgroundJobs(result.orderId));
  return new Response(result.xml,{headers:{'content-type':'application/xml','cache-control':'no-store'}});
 }catch{console.error('Voice turn could not be processed');return new Response('Ordering temporarily unavailable',{status:503});}
}
