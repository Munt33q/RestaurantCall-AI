import {boundedJson,providerAuthorized} from '@/lib/elevenlabs-security';
import {initiateElevenLabsCall,validateInitiation} from '@/lib/elevenlabs-initiation';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function POST(request:Request){
 if(process.env.ELEVENLABS_SESSION_BINDING_ENABLED!=='true')return Response.json({error:'Initiation disabled'},{status:503,headers});
 if(!providerAuthorized(request,process.env.ELEVENLABS_SESSION_BINDING_KEY))return Response.json({error:'Unauthorized'},{status:401,headers});
 let input;try{
  const body=await boundedJson(request) as Record<string,unknown>;
  const phone=(v:unknown)=>typeof v==='string'&&/^\d{10}$/.test(v)&&process.env.ELEVENLABS_INBOUND_NUMBER?.startsWith('+1')?'+1'+v:typeof v==='string'&&/^[1-9]\d{10,14}$/.test(v)?'+'+v:v;
  if(body&&typeof body==='object'&&!Array.isArray(body)){body.caller_id=phone(body.caller_id);body.called_number=phone(body.called_number);}
  input=validateInitiation(body);
 }catch{return Response.json({error:'Invalid provider initiation'},{status:400,headers});}
 try{return Response.json(await initiateElevenLabsCall(input),{headers});}catch{return Response.json({error:'Call binding unavailable or conflicting'},{status:409,headers});}
}
