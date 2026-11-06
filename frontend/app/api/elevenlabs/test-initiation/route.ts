import {boundedJson,providerAuthorized} from '@/lib/elevenlabs-security';
import {initiateElevenLabsCall,validateInitiation} from '@/lib/elevenlabs-initiation';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
// Temporary caller-scoped staging gate. Other callers retain their original agent
// configuration and never receive a staging session or order-tool credential.
export async function POST(request:Request){
 if(process.env.VERCEL_ENV!=='preview'||process.env.ELEVENLABS_SESSION_BINDING_ENABLED!=='true')return Response.json({error:'Test routing disabled'},{status:503,headers});
 if(!providerAuthorized(request,process.env.ELEVENLABS_SESSION_BINDING_KEY))return Response.json({error:'Unauthorized'},{status:401,headers});
 let input;try{const body=await boundedJson(request) as Record<string,unknown>;
 const phone=(v:unknown)=>typeof v==='string'&&/^\d{10}$/.test(v)&&process.env.ELEVENLABS_INBOUND_NUMBER?.startsWith('+1')?'+1'+v:typeof v==='string'&&/^[1-9]\d{10,14}$/.test(v)?'+'+v:v;
 if(body&&typeof body==='object'&&!Array.isArray(body)){body.caller_id=phone(body.caller_id);body.called_number=phone(body.called_number);}
 input=validateInitiation(body,false);} catch{return Response.json({error:'Invalid provider initiation'},{status:400,headers});}
 const allowed=process.env.ELEVENLABS_ACCEPTANCE_CALLERS?.split(',').map(x=>x.trim())??[];
 if(!allowed.includes(input.caller_id))return Response.json({type:'conversation_initiation_client_data',dynamic_variables:{}},{headers});
 const branch=process.env.ELEVENLABS_STAGING_BRANCH_ID?.trim();
 if(!branch)return Response.json({error:'Staging branch not configured'},{status:503,headers});
 try{return Response.json({...await initiateElevenLabsCall(input),branch_id:branch},{headers});}catch{return Response.json({error:'Call binding unavailable or conflicting'},{status:409,headers});}
}
