import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhook(signature: string | null, requestId: string | null, resourceId: string | null, secret: string, now = Date.now()) {
  if (!signature || !requestId || !resourceId || signature.length > 512 || requestId.length > 128 || !/^[a-zA-Z0-9_-]{1,128}$/.test(resourceId)) return false;
  const pieces = signature.split(",").map((s) => s.trim().split("="));
  if (pieces.filter(([k]) => k === "ts").length !== 1 || pieces.filter(([k]) => k === "v1").length !== 1) return false;
  const ts = pieces.find(([k]) => k === "ts")?.[1], digest = pieces.find(([k]) => k === "v1")?.[1];
  if (!ts || !/^(?:\d{10}|\d{13})$/.test(ts) || !digest || !/^[a-fA-F0-9]{64}$/.test(digest)) return false;
  const millis = ts.length === 10 ? Number(ts) * 1000 : Number(ts);
  if (Math.abs(now - millis) > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret).update(`id:${resourceId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest();
  return timingSafeEqual(expected, Buffer.from(digest, "hex"));
}
