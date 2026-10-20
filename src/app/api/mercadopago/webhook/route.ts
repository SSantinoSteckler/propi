import { createHash } from "node:crypto";
import { z } from "zod";
import { verifyWebhook } from "@/lib/mercadopago/webhooks";
import { json, billingFailure } from "@/lib/billing/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return json({ message: "Servicio no configurado." }, 503);
  const url = new URL(request.url), id = url.searchParams.get("data.id");
  if (url.searchParams.getAll("data.id").length !== 1 || !verifyWebhook(request.headers.get("x-signature"), request.headers.get("x-request-id"), id, secret)) return json({ message: "Firma inválida." }, 401);
  if (Number(request.headers.get("content-length")) > 16384) return json({}, 413);
  try {
    const raw = await request.text(); if (Buffer.byteLength(raw) > 16384) return json({}, 413);
    const parsed = z.object({ type: z.string().max(80), data: z.object({ id: z.union([z.string().max(128),z.number().int().nonnegative().safe()]) }) }).safeParse(JSON.parse(raw));
    if (!parsed.success || String(parsed.data.data.id).toLowerCase() !== id!.toLowerCase()) return json({}, 400);
    const { adminDb } = await import("@/lib/supabase/admin");
    const { processEvent, rateLimit } = await import("@/lib/billing/runtime");
    const db = adminDb();
    await rateLimit(db, "webhook:mercadopago", 300, 60);
    const key = createHash("sha256").update(`${request.headers.get("x-request-id")}:${id!.toLowerCase()}`).digest("hex");
    const { error } = await db.from("billing_webhook_events").upsert({ event_key: key, event_type: parsed.data.type, resource_id: id!.toLowerCase() }, { onConflict: "event_key", ignoreDuplicates: true });
    if (error) return json({}, 503);
    await processEvent(key, db);
    return json({ received: true });
  } catch (error) {
    if (error instanceof SyntaxError) return json({}, 400);
    return billingFailure(error);
  }
}
