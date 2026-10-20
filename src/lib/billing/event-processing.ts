import { BillingError, requireCondition } from "./domain";
import type { Agreement, MPInvoice, MPSubscription } from "./types";

export type BillingEvent = { event_key: string; event_type: string; resource_id: string; processing_status: string; attempts: number };
export type EventDependencies = {
  lock: <T>(key: string, work: () => Promise<T>) => Promise<T>;
  load: (key: string) => Promise<BillingEvent>;
  update: (key: string, values: Record<string, unknown>) => Promise<void>;
  subscription: (id: string) => Promise<MPSubscription>;
  invoice: (id: string) => Promise<MPInvoice>;
  invoicesForPayment: (id: string) => Promise<MPInvoice[]>;
  findBySubscription: (id: string) => Promise<Agreement | null>;
  findByReference: (reference: string) => Promise<Agreement | null>;
  synchronize: (agreement: Agreement) => Promise<void>;
};

// Only canonical provider resources establish the account relationship. The
// notification body is never evidence of payment or entitlement.
export async function processBillingEvent(key: string, dependencies: EventDependencies) {
  const d = dependencies;
  return d.lock(`event:${key}`, async () => {
    const event = await d.load(key);
    if (["processed", "ignored"].includes(event.processing_status)) return;
    await d.update(key, { attempts: event.attempts + 1 });
    try {
      let subscriptionId: string | null = null, reference: string | undefined;
      if (event.event_type === "subscription_preapproval") {
        const subscription = await d.subscription(event.resource_id);
        requireCondition(subscription.id === event.resource_id, "SUBSCRIPTION_MISMATCH");
        subscriptionId = subscription.id; reference = subscription.external_reference;
      } else if (event.event_type === "subscription_authorized_payment") {
        const invoice = await d.invoice(event.resource_id);
        requireCondition(String(invoice.id) === event.resource_id, "INVOICE_MISMATCH");
        subscriptionId = invoice.preapproval_id;
      } else if (event.event_type === "payment") {
        const invoices = await d.invoicesForPayment(event.resource_id);
        requireCondition(Array.isArray(invoices), "INVALID_INVOICE_RESPONSE");
        for (const invoice of invoices) requireCondition(String(invoice.payment?.id) === event.resource_id, "PAYMENT_MISMATCH");
        const ids = [...new Set(invoices.map((invoice) => invoice.preapproval_id))];
        requireCondition(ids.length <= 1, "AMBIGUOUS_PAYMENT");
        subscriptionId = ids[0] || null;
      }
      let agreement = subscriptionId ? await d.findBySubscription(subscriptionId) : null;
      // An invoice may arrive before the subscription-created notification or
      // before a timed-out creation POST was correlated locally.
      if (!agreement && subscriptionId && !reference) {
        const subscription = await d.subscription(subscriptionId);
        requireCondition(subscription.id === subscriptionId, "SUBSCRIPTION_MISMATCH");
        reference = subscription.external_reference;
      }
      if (!agreement && reference) agreement = await d.findByReference(reference);
      if (agreement) await d.synchronize(agreement);
      else if (subscriptionId && !reference) throw new BillingError("AWAITING_CORRELATION", 503);
      await d.update(key, { processing_status: agreement ? "processed" : "ignored", processed_at: new Date().toISOString() });
    } catch (error) {
      await d.update(key, { processing_status: "failed", retry_after: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(event.attempts, 6))).toISOString() });
      throw error;
    }
  });
}
