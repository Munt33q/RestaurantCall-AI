import {staffAuthorized} from '@/lib/auth';import {listCalls} from '@/lib/operations';export const dynamic='force-dynamic';
export async function GET(){if(!staffAuthorized())return new Response('Unauthorized',{status:401});return Response.json(await listCalls(),{headers:{'Cache-Control':'no-store'}});}
