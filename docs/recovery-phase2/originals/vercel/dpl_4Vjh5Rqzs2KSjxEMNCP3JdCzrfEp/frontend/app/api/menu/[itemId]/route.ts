import { NextResponse } from "next/server";
import { updateMenuAvailability } from "@/lib/repository";
import { staffAuthorized, sameOrigin } from "@/lib/auth";
export async function PATCH(request: Request, { params }: { params: { itemId: string } }) { if (!staffAuthorized() || !sameOrigin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); if(request.headers.get('content-type')?.includes('application/json')){try{const {version,...item}=await request.json();return NextResponse.json(await saveCatalogItem(item,params.itemId,version));}catch(e){return catalogError(e);}} const available = new URL(request.url).searchParams.get("available") === "true"; try { const item = await updateMenuAvailability(params.itemId, available); return item ? NextResponse.json(item) : NextResponse.json({ error: "Menu item not found" }, { status: 404 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Database unavailable" }, { status: 503 }); } }

import {saveCatalogItem} from '@/lib/catalog-store';import {catalogError} from '@/lib/catalog-api';
