import { NextResponse } from "next/server";
import { listMenu } from "@/lib/repository";
export const dynamic='force-dynamic';
export async function GET(request:Request) { try { const staff=new URL(request.url).searchParams.get('staff')==='true';if(staff&&!staffAuthorized())return NextResponse.json({error:'Unauthorized'},{status:401});return NextResponse.json(staff?await listStaffCatalog():await listMenu(),{headers:{'Cache-Control':'no-store'}}); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Database unavailable" }, { status: 503 }); } }

import {staffAuthorized,sameOrigin} from '@/lib/auth';
import {listStaffCatalog,saveCatalogItem} from '@/lib/catalog-store';import {catalogError} from '@/lib/catalog-api';
export async function POST(request:Request){if(!staffAuthorized()||!sameOrigin(request))return NextResponse.json({error:'Unauthorized'},{status:401});try{return NextResponse.json(await saveCatalogItem(await request.json()),{status:201});}catch(e){return catalogError(e);}}
