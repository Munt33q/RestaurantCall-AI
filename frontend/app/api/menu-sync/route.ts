import {staffAuthorized,sameOrigin} from '@/lib/auth';
import {client} from '@/lib/db/client';import {restaurantId} from '@/lib/repository';
import {syncConfig,kickMenuSync} from '@/lib/menu-sync';
export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(){if(!staffAuthorized())return new Response('Unauthorized',{status:401});const [state]=await client()`SELECT document_id,agent_id,branch_id,content_hash,last_synced_at,last_error,attempts,next_at,synced_revision FROM menu_sync_jobs WHERE restaurant_id=${restaurantId()}`;kickMenuSync();return Response.json({configured:syncConfig().enabled,state:state??null},{headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){if(!staffAuthorized()||!sameOrigin(request))return new Response('Unauthorized',{status:401});await client()`INSERT INTO menu_sync_jobs(restaurant_id) VALUES(${restaurantId()}) ON CONFLICT(restaurant_id) DO UPDATE SET next_at=now(),attempts=0`;kickMenuSync();return Response.json({queued:true},{status:202});}
