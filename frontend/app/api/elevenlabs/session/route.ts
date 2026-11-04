import crypto from 'node:crypto';
import {bindElevenLabsConversation} from '@/lib/elevenlabs-session';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'no-store'};
export async function POST(request:Request){
 if(process.env.ELEVENLABS_SESSION_BINDING_ENABLED!=='true')return Response.json({ok:false,error:'Session binding not enabled'},{status:503,headers:noStore});
 const configured=process.env.ELEVENLABS_SESSION_BINDING_KEY?.trim()??'';
 const provided=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')??'';
 const a=Buffer.from(configured),b=Buffer.from(provided);
 if(configured.length<32||a.length!==b.length||!crypto.timingSafeEqual(a,b))return Response.json({ok:false,error:'Unauthorized'},{status:401,headers:noStore});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body.conversation_id!=='string'||typeof body.provider_call_id!=='string')return Response.json({ok:false,error:'Invalid binding payload'},{status:400,headers:noStore});
 try{return Response.json({ok:true,...await bindElevenLabsConversation({conversationId:body.conversation_id,providerCallId:body.provider_call_id})},{headers:noStore});}
 catch(error){const message=error instanceof Error?error.message:'Session binding failed';return Response.json({ok:false,error:message},{status:409,headers:noStore});}
}
