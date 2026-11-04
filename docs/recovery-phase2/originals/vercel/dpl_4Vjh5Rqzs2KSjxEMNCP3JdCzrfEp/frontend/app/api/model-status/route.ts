import {staffAuthorized} from '@/lib/auth';import {modelStatus} from '@/lib/model-monitor';
export const dynamic='force-dynamic';export async function GET(){if(!staffAuthorized())return new Response('Unauthorized',{status:401});try{return Response.json(await modelStatus(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Monitoring unavailable'},{status:503});}}
