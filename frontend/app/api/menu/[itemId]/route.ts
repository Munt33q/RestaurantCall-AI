import { NextResponse } from "next/server";
import { updateMenuAvailability } from "@/lib/repository";
import { staffAuthorized } from "@/lib/auth";
export async function PATCH(request: Request, { params }: { params: { itemId: string } }) { if (!staffAuthorized()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const available = new URL(request.url).searchParams.get("available") === "true"; try { const item = await updateMenuAvailability(params.itemId, available); return item ? NextResponse.json(item) : NextResponse.json({ error: "Menu item not found" }, { status: 404 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Database unavailable" }, { status: 503 }); } }
