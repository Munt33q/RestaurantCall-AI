import {relayPublicJwk} from '@/lib/relay-token';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({keys:[relayPublicJwk()]},{headers:{'Cache-Control':'public, max-age=60'}});}
