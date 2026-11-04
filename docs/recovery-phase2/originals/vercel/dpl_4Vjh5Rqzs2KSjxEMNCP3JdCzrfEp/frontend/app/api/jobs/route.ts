import {processBackgroundJobs} from '@/lib/background-jobs';
import {retryPaymentJobs,runPaymentJobs} from '@/lib/payments';
import {staffAuthorized,sameOrigin} from '@/lib/auth';
export const maxDuration=60;
export async function POST(request:Request){if(!staffAuthorized()||!sameOrigin(request))return new Response('Unauthorized',{status:401});const body=await request.json().catch(()=>({}));if(body.retryFailed)await retryPaymentJobs();return Response.json(await processBackgroundJobs());}
