import { timingSafeEqual, createHash } from "node:crypto";
import { json, billingFailure } from "@/lib/billing/http";
import { cronProviderEnabled } from "@/lib/deployment";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return json({}, 503);
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(request.headers.get("authorization") || ""), digest(`Bearer ${secret}`))) return json({}, 401);
  if (!cronProviderEnabled()) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  try {
    const { reconcile } = await import("@/lib/billing/runtime");
    const { withProviderBudget } = await import("@/lib/mercadopago/client");
    return json(await withProviderBudget(reconcile));
  } catch (error) { return billingFailure(error); }
}
