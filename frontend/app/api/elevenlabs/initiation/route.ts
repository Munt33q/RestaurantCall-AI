import {boundedJson,providerAuthorized} from '@/lib/elevenlabs-security';
import {initiateElevenLabsCall,validateInitiation} from '@/lib/elevenlabs-initiation';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function POST(request:Request){
 if(process.env.ELEVENLABS_SESSION_BINDING_ENABLED!=='true')return Response.json({error:'Initiation disabled'},{status:503,headers});
 if(!providerAuthorized(request,process.env.ELEVENLABS_SESSION_BINDING_KEY))return Response.json({error:'Unauthorized'},{status:401,headers});
 let input;try{input=validateInitiation(await boundedJson(request));}catch{return Response.json({error:'Invalid provider initiation'},{status:400,headers});}
 try{return Response.json(await initiateElevenLabsCall(input),{headers});}catch{return Response.json({error:'Call binding unavailable or conflicting'},{status:409,headers});}
}
