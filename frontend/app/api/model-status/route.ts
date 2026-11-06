import {staffAuthorized} from '@/lib/auth';import {modelStatus} from '@/lib/model-monitor';import {client} from '@/lib/db/client';import {restaurantId} from '@/lib/repository';
export const dynamic='force-dynamic';export async function GET(){if(!staffAuthorized())return new Response('Unauthorized',{status:401});try{if(process.env.ELEVENLABS_SESSION_BINDING_ENABLED==='true'){
 const [r]=await client()`SELECT max(o.created_at) AS last_success_at FROM orders o JOIN call_sessions s ON s.id=o.session_id WHERE o.restaurant_id=${restaurantId()} AND s.elevenlabs_binding_source='provider_initiation'`;
 return Response.json({provider:'elevenlabs',health:null,incidents:[],stale:!r.last_success_at,window:r,passive:true},{headers:{'Cache-Control':'no-store'}});
 }return Response.json(await modelStatus(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Monitoring unavailable'},{status:503});}}
