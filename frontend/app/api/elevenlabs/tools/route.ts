import {kickMenuSync} from '@/lib/menu-sync';
import crypto from 'node:crypto';
import {runElevenLabsTool,ToolError,validateTool} from '@/lib/elevenlabs-tools';
import {client} from '@/lib/db/client';
import {restaurantId} from '@/lib/repository';
import {boundedJson,callToolKey,equalSecret} from '@/lib/elevenlabs-security';
import {CheckoutError} from '@/lib/customer-checkout';
export const maxDuration=30;
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'no-store'};
export async function POST(request:Request){
 if(process.env.ELEVENLABS_WEBHOOKS_ENABLED!=='true')return Response.json({ok:false,error:'Not enabled'},{status:503,headers:noStore});
 const configured=process.env.ELEVENLABS_TOOL_API_KEY?.trim()??'';
 const provided=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')??'';
 const a=Buffer.from(configured),b=Buffer.from(provided);
 if(configured.length<32||a.length!==b.length||!crypto.timingSafeEqual(a,b))return Response.json({ok:false,error:'Unauthorized'},{status:401,headers:noStore});
 try{
  const input=validateTool(await boundedJson(request));
  const [s]=await client()`SELECT provider_call_id,elevenlabs_binding_source FROM call_sessions WHERE restaurant_id=${restaurantId()} AND elevenlabs_conversation_id=${input.conversation_id}`;
  if(!s||s.elevenlabs_binding_source!=='provider_initiation'||!equalSecret(request.headers.get('x-restaurant-session'),callToolKey(input.conversation_id,s.provider_call_id)))return Response.json({ok:false,error:'Untrusted conversation session'},{status:401,headers:noStore});
  const result=await runElevenLabsTool(input);kickMenuSync();
  return Response.json(result,{status:result.ok?200:409,headers:noStore});
 }catch(error){
  if(error instanceof ToolError||error instanceof CheckoutError)return Response.json({ok:false,error:error.message},{status:error.status,headers:noStore});
  if(error instanceof SyntaxError||error instanceof Error&&['Payload too large','JSON body required'].includes(error.message))return Response.json({ok:false,error:'Invalid tool payload'},{status:400,headers:noStore});
  console.error('ElevenLabs tool operation failed');
  return Response.json({ok:false,error:'Tool temporarily unavailable'},{status:503,headers:noStore});
 }
}
