import { loadOrCreateCallSession } from "@/lib/repository";
import { verifyTelnyxWebhook, xmlEscape } from "@/lib/telnyx";

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyTelnyxWebhook(raw, request.headers.get("telnyx-signature-ed25519"), request.headers.get("telnyx-timestamp"))) return new Response("Unauthorized", { status: 401 });
  const form = new URLSearchParams(raw);
  const callId = form.get("CallControlId") || form.get("CallSid");
  if (!callId) return new Response("Missing call identifier", { status: 400 });
  await loadOrCreateCallSession(callId, form.get("From") || undefined);
  const base = (process.env.PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${xmlEscape(base)}/api/telnyx/gather" method="POST" speechTimeout="auto" timeout="6"><Say>Welcome to RestaurantCall AI. Please tell me your order.</Say></Gather><Say>I did not hear anything. Goodbye.</Say></Response>`;
  return new Response(xml, { headers: { "content-type": "application/xml" } });
}
