import type { Agreement, MPInvoice, MPPayment, MPPlan, MPSubscription, VerifiedPayment } from "./types";
import catalog from "./catalog.json" with { type: "json" };
import type { DatabaseFailureDiagnostic } from "../supabase/admin-diagnostics";

export class BillingError extends Error {
  constructor(public code: string, public status = 409, public diagnostic?: DatabaseFailureDiagnostic) { super(code); }
}
export function requireCondition(value: unknown, code: string): asserts value {
  if (!value) throw new BillingError(code, 502);
}
export function checkoutUrl(value: string | undefined) {
  requireCondition(value, "CHECKOUT_UNAVAILABLE");
  const url = new URL(value);
  requireCondition(url.protocol === "https:" && url.hostname === "www.mercadopago.com.ar" && url.pathname.startsWith("/subscriptions/checkout") && !url.username && !url.password && !url.port, "INVALID_CHECKOUT");
  return url.href;
}
export function validatePlan(plan: MPPlan, seller: string, returnUrl: string, localTest = false) {
  const r = plan.auto_recurring;
  // The catalog plan's URL is not used by our no-card-token checkout. Only the
  // pinned fictitious seller may reuse that catalog with a different local return.
  let safeCatalogReturn = false;
  try { const u = new URL(plan.back_url); safeCatalogReturn = u.protocol === "https:" && !u.username && !u.password && u.pathname === "/dashboard/billing/return" && !u.search && !u.hash; } catch { /* Invalid catalog. */ }
  requireCondition(String(plan.collector_id) === seller && plan.status === "active" && plan.reason === catalog.name && (plan.back_url === returnUrl || (localTest && seller === "3779671542" && safeCatalogReturn)), "PLAN_MISMATCH");
  requireCondition(r && Number(r.transaction_amount) === catalog.amount && r.currency_id === catalog.currency && r.frequency === 1 && r.frequency_type === "months" && !r.free_trial && !r.repetitions && !r.end_date, "PLAN_MISMATCH");
}
export function validateSubscription(s: MPSubscription, a: Agreement, seller: string) {
  requireCondition(s.external_reference === a.external_reference && String(s.collector_id) === seller && (!a.provider_subscription_id || s.id === a.provider_subscription_id), "SUBSCRIPTION_MISMATCH");
  requireCondition(!s.preapproval_plan_id || s.preapproval_plan_id === a.catalog_plan_id, "PLAN_MISMATCH");
  requireCondition(["pending","authorized","paused","cancelled","canceled"].includes(s.status), "UNKNOWN_SUBSCRIPTION_STATUS");
  const r = s.auto_recurring;
  requireCondition(r && Number(r.transaction_amount) === Number(a.amount) && r.currency_id === a.currency && r.frequency === 1 && r.frequency_type === "months" && !r.free_trial, "SUBSCRIPTION_MISMATCH");
  requireCondition(Number.isFinite(Date.parse(s.last_modified)), "MISSING_PROVIDER_VERSION");
}
// Internal service coverage, NOT a period returned by MP. Keep the provider's
// date/time offset and clamp month-end (Jan 31 -> Feb 28/29), rather than +30 days.
export function nextBillingMonth(value: string) {
  requireCondition(Number.isFinite(Date.parse(value)), "INVALID_DEBIT_DATE");
  const match = /^(\d{4})-(\d{2})-(\d{2})(T.+)$/.exec(value);
  requireCondition(match, "INVALID_DEBIT_DATE");
  const year = Number(match[1]), month = Number(match[2]);
  const nextYear = year + (month === 12 ? 1 : 0), nextMonth = month === 12 ? 1 : month + 1;
  const day = Math.min(Number(match[3]), new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate());
  return new Date(`${nextYear}-${String(nextMonth).padStart(2,"0")}-${String(day).padStart(2,"0")}${match[4]}`).toISOString();
}
export function verifyInvoice(invoice: MPInvoice, payment: MPPayment | null, s: MPSubscription, a: Agreement, seller: string): VerifiedPayment {
  requireCondition(invoice.preapproval_id === s.id && (!invoice.external_reference || String(invoice.external_reference) === a.external_reference), "INVOICE_MISMATCH");
  const start = Number.isFinite(Date.parse(invoice.debit_date)) ? new Date(invoice.debit_date).toISOString() : null;
  const end = start ? nextBillingMonth(invoice.debit_date) : null;
  let verified = false;
  if (payment) {
    requireCondition(String(payment.id) === String(invoice.payment?.id) && String(payment.collector_id) === seller, "PAYMENT_MISMATCH");
    if (s.payer_id && payment.payer?.id) requireCondition(String(s.payer_id) === String(payment.payer.id), "PAYER_MISMATCH");
    verified = payment.status === "approved" && Number(payment.transaction_amount) === Number(a.amount)
      && invoice.currency_id === a.currency && payment.currency_id === a.currency && Number(invoice.transaction_amount) === Number(a.amount)
      && !payment.transaction_amount_refunded && Number.isFinite(Date.parse(payment.date_approved || "")) && Boolean(start && end);
  }
  const updated = payment?.date_last_updated || invoice.last_modified;
  requireCondition(Number.isFinite(Date.parse(updated)), "MISSING_PAYMENT_VERSION");
  return { invoice_id: String(invoice.id), payment_id: invoice.payment?.id ? String(invoice.payment.id) : null,
    preapproval_id: s.id, amount: Number(invoice.transaction_amount), currency: invoice.currency_id,
    status: payment?.status || invoice.payment?.status || "pending", invoice_status: invoice.status,
    verified, paid_at: payment?.date_approved || null, coverage_start: start, coverage_end: end, updated_at: updated };
}
