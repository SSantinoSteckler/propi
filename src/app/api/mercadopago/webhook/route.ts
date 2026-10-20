import { handleWebhook } from "@/lib/mercadopago/webhook-handler";
import { BillingError } from "@/lib/billing/domain";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return handleWebhook(request, process.env.MERCADOPAGO_WEBHOOK_SECRET, async (notice) => {
    const { adminDb } = await import("@/lib/supabase/admin");
    const { processEvent, rateLimit } = await import("@/lib/billing/runtime");
    const { withProviderBudget } = await import("@/lib/mercadopago/client");
    const db = adminDb();
    await rateLimit(db, "webhook:mercadopago", 300, 60);
    const { error } = await db.from("billing_webhook_events").upsert({ event_key: notice.key, event_type: notice.type, resource_id: notice.resourceId }, { onConflict: "event_key", ignoreDuplicates: true });
    if (error) throw new BillingError("DATABASE_UNAVAILABLE", 503);
    // MP waits 22s for acknowledgement; leave room for database persistence.
    // A provider timeout keeps the durable event retryable and returns non-2xx.
    await withProviderBudget(() => processEvent(notice.key, db), 15000);
  });
}
