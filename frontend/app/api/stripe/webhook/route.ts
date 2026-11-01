import Stripe from "stripe";
import { recordWebhookEvent } from "@/lib/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!key || !secret || !signature) return new Response("Stripe webhook not configured", { status: 503 });
  try {
    const event = new Stripe(key).webhooks.constructEvent(await request.text(), signature, secret);
    if (!(await recordWebhookEvent(event.id, "stripe"))) return Response.json({ received: true, duplicate: true });
    return Response.json({ received: true });
  } catch { return new Response("Invalid webhook", { status: 400 }); }
}
