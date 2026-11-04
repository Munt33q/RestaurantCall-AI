import Stripe from 'stripe';
import {staffAuthorized,sameOrigin} from '@/lib/auth';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function GET(){
 if(!staffAuthorized())return new Response('Unauthorized',{status:401});
 const checks:any={};
 await Promise.all([
 (async()=>{try{const key=process.env.TELNYX_API_KEY?.trim(),id=process.env.TELNYX_TEXML_APPLICATION_ID?.trim();if(!key||!id){checks.telnyx={configured:false};return;}
 const r=await fetch(`https://api.telnyx.com/v2/texml_applications/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(8000),cache:'no-store'});
 const data=r.ok?(await r.json()).data:null;checks.telnyx={status:r.status,applicationActive:data?.active,voiceMethod:data?.voice_method,voiceUrl:data?.voice_url,statusCallback:data?.status_callback};
 const phone=process.env.TELNYX_PHONE_NUMBER?.trim();
 if(phone&&/^\+[1-9]\d{7,14}$/.test(phone)){
  const mr=await fetch(`https://api.telnyx.com/v2/messaging_phone_numbers/${encodeURIComponent(phone)}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(8000),cache:'no-store'});
  const messageConfig=mr.ok?(await mr.json()).data:null;
  checks.messaging={status:mr.status,numberFormatValid:true,profileAssigned:!!messageConfig?.messaging_profile_id,smsCapable:!!messageConfig?.features?.sms,sendingEnabled:process.env.SMS_DELIVERY_ENABLED==='true'};
  const campaignResponse=await fetch(`https://api.telnyx.com/v2/10dlc/phone_number_campaigns/${encodeURIComponent(phone)}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(6000),cache:'no-store'});const campaign=campaignResponse.ok?await campaignResponse.json():null;checks.messaging.campaignStatus=campaign?.data?.assignmentStatus??campaign?.assignmentStatus??null;checks.messaging.campaignLookupStatus=campaignResponse.status;
 }else checks.messaging={numberFormatValid:false};
 }catch{checks.telnyx={error:'Provider request unavailable'};}})(),
 (async()=>{try{const key=process.env.STRIPE_SECRET_KEY?.trim();if(!key){checks.stripe={configured:false};return;}const balance=await new Stripe(key,{timeout:8000,maxNetworkRetries:0}).balance.retrieve();checks.stripe={authenticated:true,liveMode:balance.livemode};}catch{checks.stripe={authenticated:false};}})(),
 (async()=>{try{const key=process.env.AI_API_KEY?.trim(),base=process.env.AI_BASE_URL?.trim();if(!key||!base){checks.ai={configured:false};return;}const r=await fetch(base.replace(/\/$/,'')+'/models',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(8000),cache:'no-store'});const json=r.ok?await r.json():null;checks.ai={status:r.status,modelConfigured:!!process.env.AI_MODEL?.trim(),modelListed:json?.data?.some((m:any)=>m.id===process.env.AI_MODEL?.trim())??null};}catch{checks.ai={error:'Provider request unavailable'};}})()
 ]);
 return Response.json(checks,{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request){
 if(!staffAuthorized()||!sameOrigin(request))return new Response('Unauthorized',{status:401});
 const body=await request.json().catch(()=>null);if(body?.action!=='configure_callbacks')return new Response('Unknown operation',{status:400});
 const key=process.env.TELNYX_API_KEY?.trim(),app=process.env.TELNYX_TEXML_APPLICATION_ID?.trim(),phone=process.env.TELNYX_PHONE_NUMBER?.trim(),base=process.env.PUBLIC_APP_URL?.trim();if(!key||!app||!phone||!base)return new Response('Provider configuration missing',{status:503});
 const headers={Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
 async function api(path:string,method='GET',data?:unknown){const r=await fetch('https://api.telnyx.com/v2'+path,{method,headers,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(7000),cache:'no-store'});if(!r.ok)throw new Error(`Provider configuration rejected (${r.status})`);return r.json();}
 try{
  const current=(await api('/texml_applications/'+app)).data;const target=base+'/api/telnyx/call-status';if(current.status_callback&&current.status_callback!==target)return Response.json({error:'Existing call callback belongs to another workflow; left unchanged'},{status:409});
  await api('/texml_applications/'+app,'PATCH',{status_callback:target,status_callback_method:'post'});
  const number=(await api('/messaging_phone_numbers/'+encodeURIComponent(phone))).data;let messagingConfigured=false;
  if(number.messaging_profile_id){const profile=(await api('/messaging_profiles/'+number.messaging_profile_id)).data;const webhook=base+'/api/telnyx/messaging';if(!profile.webhook_url||profile.webhook_url===webhook){await api('/messaging_profiles/'+number.messaging_profile_id,'PATCH',{webhook_url:webhook});messagingConfigured=true;}}
  return Response.json({callStatusConfigured:true,messagingConfigured});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Configuration unavailable'},{status:503});}
}
