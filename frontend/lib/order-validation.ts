export type OrderLine = { menuItemId: string; quantity: number };

/** Validate at the repository boundary, not just the HTTP route. */
export function normalizeOrderLines(lines: OrderLine[]): OrderLine[] {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) {
    throw new Error("Order must contain between 1 and 100 lines");
  }
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (!line || typeof line.menuItemId !== "string" || !line.menuItemId.trim() ||
        !Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new Error("Invalid order item or quantity");
    }
    const total = (quantities.get(line.menuItemId) ?? 0) + line.quantity;
    if (!Number.isSafeInteger(total)) throw new Error("Order quantity overflow");
    quantities.set(line.menuItemId, total);
  }
  return Array.from(quantities.entries()).sort(([a], [b]) => a.localeCompare(b))
    .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
}
