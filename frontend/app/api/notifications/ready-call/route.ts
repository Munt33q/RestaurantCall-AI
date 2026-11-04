import {staffAuthorized,sameOrigin} from '@/lib/auth';
import {readyCall} from '@/lib/ready-call';
import {client} from '@/lib/db/client';
import {restaurantId} from '@/lib/repository';
export const maxDuration=30;
export async function POST(request:Request){
 if(!staffAuthorized()||!sameOrigin(request))return new Response('Unauthorized',{status:401});
 const input=await request.json().catch(()=>null);
 try{
  const sql=client();const restaurant=restaurantId();
  const result=await readyCall(input,{apiKey:process.env.TELNYX_API_KEY?.trim()??'',applicationId:process.env.TELNYX_TEXML_APPLICATION_ID?.trim()??'',from:process.env.TELNYX_PHONE_NUMBER?.trim()??''},{
   claim:async id=>{const rows=await sql`insert into webhook_events(event_id,provider) values(${`outbound_call:${id}`},'telnyx-outbound') on conflict do nothing returning event_id`;return rows.length===1;},
   save:async call=>{await sql`insert into calls(restaurant_id,telnyx_call_id,caller_phone,status) values(${restaurant},${call.callSid},${call.to},${`outbound-${call.status}`}) on conflict(telnyx_call_id) do nothing`;}
  });
  return Response.json(result,{status:202});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Call failed; inspect history before retrying'},{status:400});}
}
