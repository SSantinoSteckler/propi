import { createHash } from "node:crypto";
import { z } from "zod";
import { verifyWebhook } from "./webhooks";
import { json, billingFailure } from "../billing/http";

export type WebhookNotice = { key: string; type: string; resourceId: string };
const topics = new Set(["subscription_preapproval", "subscription_authorized_payment", "subscription_preapproval_plan", "payment"]);

export async function handleWebhook(request: Request, secret: string | undefined, deliver: (notice: WebhookNotice) => Promise<void>) {
  if (!secret?.trim()) return json({ message: "Servicio no configurado." }, 503);
  const url = new URL(request.url), id = url.searchParams.get("data.id");
  if (url.searchParams.getAll("data.id").length !== 1 || !verifyWebhook(request.headers.get("x-signature"), request.headers.get("x-request-id"), id, secret)) return json({ message: "Firma inválida." }, 401);
  if (Number(request.headers.get("content-length")) > 16384) return json({}, 413);
  try {
    const raw = await request.text(); if (Buffer.byteLength(raw) > 16384) return json({}, 413);
    const parsed = z.object({ type: z.string().max(80), data: z.object({ id: z.union([z.string().max(128), z.number().int().nonnegative().safe()]) }) }).safeParse(JSON.parse(raw));
    if (!parsed.success || String(parsed.data.data.id).toLowerCase() !== id!.toLowerCase()) return json({}, 400);
    if (!topics.has(parsed.data.type)) return json({ received: true, ignored: true });
    const resourceId = id!.toLowerCase();
    const key = createHash("sha256").update(`${request.headers.get("x-request-id")}:${resourceId}`).digest("hex");
    await deliver({ key, type: parsed.data.type, resourceId });
    return json({ received: true });
  } catch (error) {
    if (error instanceof SyntaxError) return json({}, 400);
    return billingFailure(error);
  }
}
