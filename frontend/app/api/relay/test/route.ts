import {relayVoiceXml} from '@/lib/relay-xml';
import crypto from 'node:crypto';
import {staffAuthorized,sameOrigin} from '@/lib/auth';
import {mintRelayToken} from '@/lib/relay-token';
export async function POST(request:Request){
 if(!staffAuthorized()||!sameOrigin(request))return new Response('Unauthorized',{status:401});
 const base=process.env.RELAY_WEBSOCKET_URL?.trim();if(!base)return Response.json({error:'Relay is not configured'},{status:503});
 const callId='relay-preview-'+crypto.randomUUID(),token=mintRelayToken(callId,'preview');const url=new URL(base);url.searchParams.set('token',token);
 return Response.json({callId,wsUrl:url.toString(),mode:'preview',enabled:process.env.RELAY_ENABLED==='true',xml:relayVoiceXml(base,token,new URL(request.url).origin)},{headers:{'Cache-Control':'no-store'}});
}
