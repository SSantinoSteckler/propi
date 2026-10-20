import { handleWebhook } from "@/lib/mercadopago/webhook-handler";
import { BillingError } from "@/lib/billing/domain";
import { billingScope, billingTable } from "@/lib/billing/scope";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return handleWebhook(request, process.env.MERCADOPAGO_WEBHOOK_SECRET, async (notice) => {
    const { adminDb } = await import("@/lib/supabase/admin");
    const { processEvent, rateLimit } = await import("@/lib/billing/runtime");
    const { withProviderBudget } = await import("@/lib/mercadopago/client");
    const scope = billingScope();
    const db = adminDb();
    await rateLimit(db, `webhook:${scope.environment}:${scope.sellerId}`, 300, 60);
    const key = `${scope.environment}:${scope.sellerId}:${notice.key}`;
    const { error } = await db.from(billingTable("billing_webhook_events", scope)).upsert({ event_key: key, event_type: notice.type, resource_id: notice.resourceId, environment: scope.environment, seller_id: scope.sellerId }, { onConflict: "event_key", ignoreDuplicates: true });
    if (error) throw new BillingError("DATABASE_UNAVAILABLE", 503);
    // MP waits 22s for acknowledgement; leave room for database persistence.
    // A provider timeout keeps the durable event retryable and returns non-2xx.
    await withProviderBudget(() => processEvent(key, db), 15000);
  });
}
