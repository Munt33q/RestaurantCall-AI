import {engagementSummary} from '@/lib/engagement/metrics';
import {staffAuthorized} from '@/lib/auth';import {operationsSummary} from '@/lib/operations';export const dynamic='force-dynamic';
export async function GET(){if(!staffAuthorized())return new Response('Unauthorized',{status:401});const [summary,engagement]=await Promise.all([operationsSummary(),engagementSummary()]);return Response.json({...summary,engagement},{headers:{'Cache-Control':'no-store'}});}
