import {NextResponse} from 'next/server';import {staffAuthorized,sameOrigin} from '@/lib/auth';import {listPromotions,savePromotion} from '@/lib/catalog-store';import {catalogError} from '@/lib/catalog-api';
export const dynamic='force-dynamic';
export async function GET(){if(!staffAuthorized())return NextResponse.json({error:'Unauthorized'},{status:401});try{return NextResponse.json(await listPromotions(),{headers:{'Cache-Control':'no-store'}});}catch(e){return catalogError(e);}}
export async function POST(request:Request){if(!staffAuthorized()||!sameOrigin(request))return NextResponse.json({error:'Unauthorized'},{status:401});try{const {id,version,...p}=await request.json();return NextResponse.json(await savePromotion(p,id,version));}catch(e){return catalogError(e);}}
