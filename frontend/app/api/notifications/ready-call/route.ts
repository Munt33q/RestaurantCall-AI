import {staffAuthorized} from '@/lib/auth';
export async function POST(){if(!staffAuthorized())return new Response('Unauthorized',{status:401});return Response.json({error:'Use consented order-status callbacks. Arbitrary-number calls are disabled.'},{status:410});}
