import { NextResponse } from "next/server";
import { listMenu } from "@/lib/repository";
export async function GET() { try { return NextResponse.json(await listMenu()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Database unavailable" }, { status: 503 }); } }
