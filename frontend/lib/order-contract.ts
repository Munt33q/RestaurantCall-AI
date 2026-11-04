export type Line = { menuItemId: string; quantity: number };
export function normalizeLines(lines: Line[]): Line[] {
  if (!Array.isArray(lines) || !lines.length || lines.length > 30) throw new Error('Choose at least one menu item (maximum 30 lines)');
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (!line || typeof line.menuItemId !== 'string' || !line.menuItemId || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) throw new Error('Quantity must be a whole number between 1 and 20');
    const count = (quantities.get(line.menuItemId) ?? 0) + line.quantity;
    if (count > 20) throw new Error('Maximum 20 of each item');
    quantities.set(line.menuItemId, count);
  }
  return Array.from(quantities, ([menuItemId, quantity]) => ({ menuItemId, quantity }));
}
export function nextKitchenStatus(order: { status: string; paymentMethod: string; paymentStatus: string }, next: string) {
  if (order.paymentMethod === 'stripe' && order.paymentStatus !== 'paid') return false;
  return ({ confirmed: 'preparing', preparing: 'ready', ready: 'completed' } as Record<string, string>)[order.status] === next;
}
export type KitchenOrder = {
 id: string; customerName: string | null; status: string; totalCents: number;
 paymentMethod: string; paymentStatus: string; createdAt: string; checkoutUrl: string | null;
 items: { itemName: string; quantity: number; lineTotalCents: number }[];
};
export function jobNeedsAttention(job:{status:string;error?:string|null}){return ['pending','failed'].includes(job.status)&&!!job.error;}
