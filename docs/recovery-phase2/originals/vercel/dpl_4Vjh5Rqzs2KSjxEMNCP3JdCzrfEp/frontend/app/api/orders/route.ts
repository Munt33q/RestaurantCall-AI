import { NextResponse } from "next/server";
import { listOrders } from "@/lib/repository";
import { staffAuthorized } from "@/lib/auth";
export async function GET() { if (!staffAuthorized()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); try { return NextResponse.json(await listOrders()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Database unavailable" }, { status: 503 }); } }
