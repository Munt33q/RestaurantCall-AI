import crypto from 'node:crypto';
import {runElevenLabsTool,ToolError,validateTool} from '@/lib/elevenlabs-tools';
export const maxDuration=30;
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'no-store'};
export async function POST(request:Request){
 if(process.env.ELEVENLABS_WEBHOOKS_ENABLED!=='true')return Response.json({ok:false,error:'Not enabled'},{status:503,headers:noStore});
 const configured=process.env.ELEVENLABS_TOOL_API_KEY?.trim()??'';
 const provided=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')??'';
 const a=Buffer.from(configured),b=Buffer.from(provided);
 if(configured.length<32||a.length!==b.length||!crypto.timingSafeEqual(a,b))return Response.json({ok:false,error:'Unauthorized'},{status:401,headers:noStore});
 const raw=await request.text();if(raw.length>4096)return Response.json({ok:false,error:'Too large'},{status:413,headers:noStore});
 try{
  const input=validateTool(JSON.parse(raw));
  const result=await runElevenLabsTool(input);
  return Response.json(result,{status:result.ok?200:409,headers:noStore});
 }catch(error){
  if(error instanceof ToolError)return Response.json({ok:false,error:error.message},{status:error.status,headers:noStore});
  console.error('ElevenLabs tool operation failed');
  return Response.json({ok:false,error:'Tool temporarily unavailable'},{status:503,headers:noStore});
 }
}
