import { NextResponse } from "next/server";
import { updateOrderStatus } from "@/lib/repository";
import { staffAuthorized } from "@/lib/auth";
export async function PATCH(request: Request, { params }: { params: { orderId: string } }) { if (!staffAuthorized()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const body = await request.json() as { status?: string }; try { const order = await updateOrderStatus(params.orderId, body.status || ""); return order ? NextResponse.json(order) : NextResponse.json({ error: "Order not found" }, { status: 404 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Database unavailable" }, { status: 503 }); } }
