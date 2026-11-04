import {understandVoiceTurn,type Understanding} from '@/lib/ai-menu';
import crypto from 'node:crypto';
import {staffAuthorized,sameOrigin} from '@/lib/auth';
import {openVoiceSession,processVoiceTurn,listMenu,voiceContext} from '@/lib/repository';
export async function POST(request:Request){
 if(!staffAuthorized()||!sameOrigin(request))return new Response('Unauthorized',{status:401});
 try{
 const body=await request.json();const base=process.env.PUBLIC_APP_URL?.trim()||new URL(request.url).origin;
 if(body.action==='start'){const callId='demo-'+crypto.randomUUID();const xml=await openVoiceSession(callId,undefined,base);return Response.json({callId,turn:0,xml});}
 if(typeof body.callId!=='string'||!/^demo-[0-9a-f-]{36}$/.test(body.callId)||typeof body.speech!=='string'||body.speech.length>1000||!Number.isInteger(body.turn)||body.turn<0||body.turn>100)return new Response('Invalid demo turn',{status:400});
 // Simulator is cash-only: no calls, SMS or payment-provider operations.
 if(/\b(card|credit|debit|stripe)\b/i.test(body.speech))return Response.json({error:'The simulator uses cash only. It never sends SMS or charges a card.'},{status:400});
 const context=await voiceContext(body.callId);const interpreted:Understanding=context?await understandVoiceTurn(body.speech,await listMenu(),context):{speech:body.speech};
 const result=await processVoiceTurn({providerCallId:body.callId,speech:body.speech,turn:body.turn,base,interpretedSpeech:interpreted.speech,extracted:interpreted.extracted,operation:interpreted.operation,assistantReply:interpreted.assistantReply,offeredItemIds:interpreted.offeredItemIds});return Response.json({callId:body.callId,turn:body.turn+1,xml:result.xml,orderId:result.orderId});
 }catch{console.error('Demo turn failed');return Response.json({error:'Could not process this demo turn. Check database setup.'},{status:503});}
}
