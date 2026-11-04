import crypto from 'node:crypto';import {processBackgroundJobs} from '@/lib/background-jobs';import {client} from '@/lib/db/client';import {restaurantId} from '@/lib/repository';
export const maxDuration=60;export const dynamic='force-dynamic';
export async function GET(request:Request){const secret=process.env.CRON_SECRET?.trim(),actual=request.headers.get('authorization')??'';if(!secret)return new Response('Scheduler not configured',{status:503});const a=Buffer.from(actual),b=Buffer.from('Bearer '+secret);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return new Response('Unauthorized',{status:401});
 const sql=client();await sql`UPDATE call_sessions SET state='expired',ended_at=COALESCE(ended_at,expires_at),outcome=COALESCE(outcome,'session_expired') WHERE restaurant_id=${restaurantId()} AND ended_at IS NULL AND expires_at<now()`;
 return Response.json(await processBackgroundJobs());}
