import { createHmac } from "node:crypto";
import { z } from "zod";
import { SITE_URL } from "../../../lib/config";
const schema = z.object({
  username: z.string().regex(/^[a-z0-9-]{3,48}$/),
  kind: z.enum(["portfolio", "property", "collection", "whatsapp", "social"]),
  propertySlug: z.string().max(120).optional(),
  collectionToken: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (status: number) =>
  new Response(null, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  if (request.headers.get("origin") !== SITE_URL)
    return reply(403);
  if (
    /bot|crawler|spider|headless|preview|curl|wget/i.test(
      request.headers.get("user-agent") || "",
    )
  )
    return reply(204);
  if (Number(request.headers.get("content-length") || 0) > 2048)
    return reply(413);
  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 2048) return reply(413);
    body = JSON.parse(raw);
  } catch {
    return reply(400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return reply(400);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return reply(503);
  try {
    // El SDK solo se carga cuando la ingesta tiene configuración de servidor.
    const { createClient } = await import("@supabase/supabase-js");
    const ip = (
      request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for") ||
      "local"
    ).split(",")[0];
    const fingerprint = createHmac("sha256", key)
      .update(
        `propi:analytics:v1|${new Date().toISOString().slice(0, 10)}|${ip}|${(request.headers.get("user-agent") || "").slice(0, 300)}`,
      )
      .digest("hex");
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const v = parsed.data;
    const { error } = await client.rpc("record_event", {
      p_username: v.username,
      p_kind: v.kind,
      p_property_slug: v.propertySlug || null,
      p_collection_token: v.collectionToken || null,
      p_fingerprint: fingerprint,
    });
    return reply(error ? 503 : 204);
  } catch {
    return reply(503);
  }
}
