import crypto from "node:crypto";

export function verifyTelnyxWebhook(rawBody: string, signature: string | null, timestamp: string | null) {
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKey || !signature || !timestamp) return false;
  const age = Math.abs(Date.now() - Number(timestamp) * 1000);
  if (!Number.isFinite(age) || age > 5 * 60 * 1000) return false;
  try { return crypto.verify(null, Buffer.from(`${timestamp}|${rawBody}`), publicKey, Buffer.from(signature, "base64")); } catch { return false; }
}

export function xmlEscape(value: string) { return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] || c)); }
