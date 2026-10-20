import { handleWebhook } from "@/lib/mercadopago/webhook-handler";
import { BillingError } from "@/lib/billing/domain";
import { billingScope, billingTable } from "@/lib/billing/scope";
import { logWebhookFailure, type WebhookStage } from "@/lib/mercadopago/webhook-diagnostics";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  let stage: WebhookStage = "validation";
  const response = await handleWebhook(request, process.env.MERCADOPAGO_WEBHOOK_SECRET, async (notice) => {
    stage = "dependencies";
    const { adminDb } = await import("@/lib/supabase/admin");
    const { processEvent, rateLimit } = await import("@/lib/billing/runtime");
    const { withProviderBudget } = await import("@/lib/mercadopago/client");
    stage = "scope";
    const scope = billingScope();
    stage = "database_client";
    const db = adminDb();
    stage = "rate_limit";
    await rateLimit(db, `webhook:${scope.environment}:${scope.sellerId}`, 300, 60);
    const key = `${scope.environment}:${scope.sellerId}:${notice.key}`;
    stage = "event_store";
    const { error } = await db.from(billingTable("billing_webhook_events", scope)).upsert({ event_key: key, event_type: notice.type, resource_id: notice.resourceId, environment: scope.environment, seller_id: scope.sellerId }, { onConflict: "event_key", ignoreDuplicates: true });
    if (error) throw new BillingError("DATABASE_UNAVAILABLE", 503);
    // MP waits 22s for acknowledgement; leave room for database persistence.
    // A provider timeout keeps the durable event retryable and returns non-2xx.
    stage = "event_processing";
    await withProviderBudget(() => processEvent(key, db), 15000);
  });
  await logWebhookFailure(response, stage);
  return response;
}
