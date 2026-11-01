import { and, desc, eq, sql } from "drizzle-orm";
import { database } from "./db";
import { callSessions, conversationTurns, draftCarts, menuItems, orderItems, orders, restaurants, webhookEvents } from "./db/schema";
import { quoteOrder } from "./pricing";

function restaurantId() { const value = process.env.RESTAURANT_ID; if (!value) throw new Error("RESTAURANT_ID is required"); return value; }

export async function listMenu() {
  const db = database();
  return db.select().from(menuItems).where(eq(menuItems.restaurantId, restaurantId())).orderBy(menuItems.category, menuItems.name);
}

export async function updateMenuAvailability(id: string, available: boolean) {
  const db = database();
  const [item] = await db.update(menuItems).set({ isAvailable: available }).where(and(eq(menuItems.id, id), eq(menuItems.restaurantId, restaurantId()))).returning();
  return item ?? null;
}

export async function listOrders() {
  const db = database();
  return db.select().from(orders).where(eq(orders.restaurantId, restaurantId())).orderBy(desc(orders.createdAt));
}

export async function updateOrderStatus(id: string, status: string) {
  if (!["confirmed", "preparing", "ready", "completed"].includes(status)) throw new Error("Invalid order status");
  const db = database();
  const [order] = await db.update(orders).set({ status }).where(and(eq(orders.id, id), eq(orders.restaurantId, restaurantId()))).returning();
  return order ?? null;
}

export async function createOrder(input: { customerName: string; customerPhone?: string; paymentMethod: "cash" | "stripe"; items: Array<{ menuItemId: string; quantity: number }>; notes?: string; }) {
  const db = database();
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(menuItems).where(eq(menuItems.restaurantId, restaurantId())).for("update");
    const selected = input.items.map((line) => { const item = rows.find((candidate) => candidate.id === line.menuItemId); if (!item) throw new Error("Menu item not found"); if (!item.isAvailable || (item.stockQty !== null && item.stockQty < line.quantity)) throw new Error(`${item.name} is unavailable`); return { item, quantity: line.quantity }; });
    const quote = quoteOrder(selected.map(({ item, quantity }) => ({ priceCents: item.priceCents, quantity })));
    for (const { item, quantity } of selected) { if (item.stockQty !== null) { const changed = await tx.update(menuItems).set({ stockQty: sql`${menuItems.stockQty} - ${quantity}` }).where(and(eq(menuItems.id, item.id), sql`${menuItems.stockQty} >= ${quantity}`)).returning({ id: menuItems.id }); if (!changed.length) throw new Error("Inventory changed; please retry"); } }
    const [order] = await tx.insert(orders).values({ restaurantId: restaurantId(), customerName: input.customerName, customerPhone: input.customerPhone, paymentMethod: input.paymentMethod, paymentStatus: input.paymentMethod === "cash" ? "unpaid" : "pending", status: input.paymentMethod === "cash" ? "confirmed" : "awaiting_payment", subtotalCents: quote.subtotalCents, taxCents: quote.taxCents, totalCents: quote.totalCents, stockReserved: true, notes: input.notes, confirmedAt: input.paymentMethod === "cash" ? new Date() : null }).returning();
    await tx.insert(orderItems).values(selected.map(({ item, quantity }) => ({ orderId: order.id, menuItemId: item.id, itemName: item.name, quantity, unitPriceCents: item.priceCents, lineTotalCents: item.priceCents * quantity })));
    return order;
  });
}

export async function recordWebhookEvent(eventId: string, provider: string) {
  const db = database();
  const inserted = await db.insert(webhookEvents).values({ eventId, provider }).onConflictDoNothing().returning({ eventId: webhookEvents.eventId });
  return inserted.length === 1;
}

export async function loadOrCreateCallSession(providerCallId: string, callerPhone?: string) {
  const db = database();
  const existing = await db.select().from(callSessions).where(eq(callSessions.providerCallId, providerCallId)).limit(1);
  if (existing[0] && existing[0].expiresAt > new Date()) return existing[0];
  return db.transaction(async (tx) => {
    const [session] = await tx.insert(callSessions).values({ restaurantId: restaurantId(), providerCallId, callerPhone, expiresAt: new Date(Date.now() + 30 * 60 * 1000) }).onConflictDoUpdate({ target: callSessions.providerCallId, set: { callerPhone, state: "active", expiresAt: new Date(Date.now() + 30 * 60 * 1000), updatedAt: new Date(), version: sql`${callSessions.version} + 1` } }).returning();
    await tx.insert(draftCarts).values({ sessionId: session.id }).onConflictDoNothing();
    return session;
  });
}

export async function appendConversationTurn(sessionId: string, role: string, content: string) {
  const db = database();
  return db.transaction(async (tx) => {
    const latest = await tx.select({ sequence: conversationTurns.sequence }).from(conversationTurns).where(eq(conversationTurns.sessionId, sessionId)).orderBy(desc(conversationTurns.sequence)).limit(1);
    const [turn] = await tx.insert(conversationTurns).values({ sessionId, sequence: (latest[0]?.sequence ?? -1) + 1, role, content }).returning();
    return turn;
  });
}

export async function updateDraftCart(sessionId: string, items: Array<{ menuItemId: string; quantity: number }>, confirmationState: "unconfirmed" | "confirmed") {
  const db = database();
  const [cart] = await db.update(draftCarts).set({ itemsJson: JSON.stringify(items), confirmationState, version: sql`${draftCarts.version} + 1`, updatedAt: new Date() }).where(eq(draftCarts.sessionId, sessionId)).returning();
  if (!cart) throw new Error("Call session not found");
  return cart;
}

export async function getDraftCart(sessionId: string) {
  const db = database();
  const [cart] = await db.select().from(draftCarts).where(eq(draftCarts.sessionId, sessionId)).limit(1);
  if (!cart) return null;
  return { ...cart, items: JSON.parse(cart.itemsJson) as Array<{ menuItemId: string; quantity: number }> };
}

