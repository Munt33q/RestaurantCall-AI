import {staffAuthorized} from '@/lib/auth';import {orderDetail} from '@/lib/operations';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:{orderId:string}}){if(!staffAuthorized())return new Response('Unauthorized',{status:401});const data=await orderDetail(params.orderId);return data?Response.json(data,{headers:{'Cache-Control':'no-store'}}):new Response('Not found',{status:404});}
