import crypto from "node:crypto";

export function verifyTelnyxWebhook(rawBody: string, signature: string | null, timestamp: string | null) {
  const publicKey = process.env.TELNYX_PUBLIC_KEY?.trim();
  if (!publicKey || !signature || !timestamp) return false;
  const age = Math.abs(Date.now() - Number(timestamp) * 1000);
  if (!Number.isFinite(age) || age > 5 * 60 * 1000) return false;
  try {
    const key = publicKey.includes("BEGIN PUBLIC KEY") ? crypto.createPublicKey(publicKey.replace(/\\n/g, "\n")) : crypto.createPublicKey({key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey, "base64")]), format: "der", type: "spki"});
    return crypto.verify(null, Buffer.from(`${timestamp}|${rawBody}`), key, Buffer.from(signature, "base64"));
  } catch { return false; }
}

export function xmlEscape(value: string) { return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] || c)); }
