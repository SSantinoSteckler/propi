import "server-only";
import { adminDb } from "../supabase/admin";
import { databaseFailureDiagnostic, type DatabaseOperation } from "../supabase/admin-diagnostics";
import { mp, ProviderError, withProviderBudget } from "../mercadopago/client";
import { readAuthorizedPayments, type InvoiceSearchPage } from "../mercadopago/authorized-payments";
import { SITE_URL } from "../config";
import catalog from "./catalog.json";
import { reservedCreation } from "./creation";
import { checkoutOffer } from "./checkout-offer";
import { processBillingEvent, type BillingEvent } from "./event-processing";
import { billingScope, assertScopeOwner, assertSeller, assertAgreementScope, scopedQuery, billingReturnUrl, billingTable, type BillingTable } from "./scope";
import { BillingError, checkoutUrl, nextBillingMonth, requireCondition, validatePlan, validateSubscription, verifyInvoice } from "./domain";
import type { Agreement, BillingStatus, Entitlements, MPInvoice, MPPayment, MPPlan, MPSubscription, VerifiedPayment } from "./types";

type Db = ReturnType<typeof adminDb>;
function checked<T>(result: { data: T; error: unknown; status?: number }, operation: DatabaseOperation = "billing_query"): T {
  if (result.error) throw new BillingError("DATABASE_UNAVAILABLE", 503,
    databaseFailureDiagnostic(result, operation, process.env.SUPABASE_SECRET_KEY));
  return result.data;
}
export function billingAvailable() {
  try { billingScope(); billingReturnUrl(SITE_URL); } catch { return false; }
  let publicOrigin = false;
  try { const url = new URL(SITE_URL); publicOrigin = url.origin === SITE_URL && url.protocol === "https:" && !["localhost","127.0.0.1","[::1]"].includes(url.hostname); } catch { /* Invalid configuration disables checkout. */ }
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN && process.env.MERCADOPAGO_WEBHOOK_SECRET && process.env.MERCADOPAGO_PRO_PLAN_ID && process.env.SUPABASE_SECRET_KEY && publicOrigin);
}
export async function getUserEntitlements(owner: string, db = adminDb()): Promise<Entitlements> {
  await assertOwner(owner, db);
  return checked(await db.rpc("billing_get_entitlements", { p_owner: owner }), "billing_get_entitlements") as Entitlements;
}
async function assertOwner(owner: string, db: Db) {
  const scope = billingScope();
  assertScopeOwner(scope, owner);
  const reserved = checked(await db.rpc("billing_is_test_owner", { p_owner: owner }), "billing_is_test_owner");
  if (Boolean(reserved) !== (scope.environment === "test")) throw new BillingError("BILLING_SCOPE_MISMATCH", 403);
}
function scopedRows(db: Db, table: BillingTable) {
  const scope = billingScope();
  return scopedQuery(db.from(billingTable(table, scope)).select("*"), scope);
}
export async function rateLimit(db: Db, key: string, limit: number, seconds: number) {
  if (!checked(await db.rpc("billing_rate_limit", { p_key: key, p_limit: limit, p_seconds: seconds }), "billing_rate_limit")) throw new BillingError("RATE_LIMIT", 429);
}
export async function withLock<T>(db: Db, key: string, work: (token: string) => Promise<T>): Promise<T> {
 return withProviderBudget(async () => {
  const token = checked(await db.rpc("billing_acquire_lock", { p_key: key })) as string | null;
  if (!token) throw new BillingError("IN_PROGRESS", 409);
  try { return await work(token); }
  finally { await db.rpc("billing_release_lock", { p_key: key, p_token: token }); }
 });
}
async function sellerId() {
  const user = await mp<{ id: number; site_id: string; tags?: string[] }>("/users/me");
  assertSeller(billingScope(), user);
  return String(user.id);
}
async function currentAgreement(db: Db, owner: string) {
  return checked(await scopedRows(db, "billing_agreements").eq("owner_id", owner).order("created_at", { ascending: false }).limit(1).maybeSingle()) as Agreement | null;
}
async function remoteFor(a: Agreement, db: Db) {
  assertAgreementScope(billingScope(), a);
  if (a.provider_subscription_id) return mp<MPSubscription>(`/preapproval/${encodeURIComponent(a.provider_subscription_id)}`);
  // external_reference is not a documented search filter. Walk the seller's
  // paginated list with a persistent cursor and compare the exact opaque reference.
  const offset = a.recovery_offset || 0;
  const found = await mp<{ results: MPSubscription[]; paging: { total: number } }>(`/preapproval/search?limit=100&offset=${offset}`);
  const exact = (found.results || []).filter((s) => s.external_reference === a.external_reference);
  requireCondition(exact.length <= 1, "DUPLICATE_PROVIDER_SUBSCRIPTIONS");
  if (exact[0]) return mp<MPSubscription>(`/preapproval/${encodeURIComponent(exact[0].id)}`);
  checked(await db.from(billingTable("billing_agreements", billingScope())).update({ recovery_offset: offset + found.results.length < found.paging.total ? offset + found.results.length : 0 }).eq("id", a.id));
  return null;
}
async function applyRemote(db: Db, a: Agreement, s: MPSubscription, token: string, seller: string) {
  assertAgreementScope(billingScope(), a);
  validateSubscription(s, a, seller);
  const payments: VerifiedPayment[] = [];
  let validations = 0;
  const invoices = await readAuthorizedPayments({ preapproval_id: s.id }, path => mp<InvoiceSearchPage>(path));
  for (const invoice of invoices) {
    let payment: MPPayment | null = null;
    // Only recent/current service cycles need a fresh Payments API lookup.
    // Older invoices remain in the ledger but cannot grant access unverified.
    const relevant = invoice.debit_date && Date.parse(nextBillingMonth(invoice.debit_date)) > Date.now() - 86400000;
    if (invoice.payment?.id && relevant) {
      if (++validations > 8) throw new BillingError("SYNC_BATCH_LIMIT", 503);
      payment = await mp<MPPayment>(`/v1/payments/${encodeURIComponent(String(invoice.payment.id))}`);
    }
    payments.push(verifyInvoice(invoice, payment, s, a, seller));
  }
  checked(await db.rpc("billing_apply_sync_v2", { p_id: a.id, p_token: token,
    p_snapshot: { environment: billingScope().environment, seller_id: seller, id: s.id, external_reference: s.external_reference, status: s.status, updated_at: s.last_modified,
      next_payment_date: s.next_payment_date || null, checkout_url: s.init_point ? checkoutUrl(s.init_point) : null }, p_payments: payments }));
}
async function markSyncError(db: Db, a: Agreement) {
  await db.from(billingTable("billing_agreements", billingScope())).update({ sync_error: true, updated_at: new Date().toISOString(), reconcile_after: new Date(Date.now() + 300000).toISOString() }).eq("id", a.id);
}
export async function synchronize(owner: string, db = adminDb(), agreementId?: string) {
  await assertOwner(owner, db);
  return withLock(db, `billing:${owner}`, async (token) => {
    const a = agreementId
      ? checked(await scopedRows(db, "billing_agreements").eq("id", agreementId).eq("owner_id", owner).single()) as Agreement
      : await currentAgreement(db, owner);
    if (!a || a.creation_state === "failed") return;
    try {
      const seller = await sellerId(), s = await remoteFor(a, db);
      if (!s) { await markSyncError(db, a); return; }
      await applyRemote(db, a, s, token, seller);
    } catch (error) { await markSyncError(db, a); throw error; }
  });
}
export async function subscribe(owner: string, payerEmail: string, db = adminDb()) {
  if (!billingAvailable()) throw new BillingError("BILLING_NOT_CONFIGURED", 503);
  await assertOwner(owner, db);
  const offer = checkoutOffer();
  return withLock(db, `billing:${owner}`, async (token) => {
    await rateLimit(db, `checkout:${owner}`, 5, 600);
    const entitlement = await getUserEntitlements(owner, db);
    if (entitlement.premium) throw new BillingError("ALREADY_PREMIUM");
    const seller = await sellerId();
    let a = await currentAgreement(db, owner);
    if (a && a.creation_state !== "failed" && !["cancelled","canceled"].includes(a.status)) {
      if (Number(a.amount) !== offer.catalog.amount) throw new BillingError("CHECKOUT_PRICE_CHANGED",409);
      // Never repeat an ambiguous POST, even after its lease expires.
      const remote = await remoteFor(a, db);
      if (!remote) throw new BillingError("AWAITING_RECONCILIATION");
      await applyRemote(db, a, remote, token, seller);
      if (remote.status === "pending") return { checkout_url: checkoutUrl(remote.init_point) };
      throw new BillingError("EXISTING_SUBSCRIPTION");
    }
    const plan = await mp<MPPlan>(`/preapproval_plan/${encodeURIComponent(process.env.MERCADOPAGO_PRO_PLAN_ID!)}`);
    const scope = billingScope(), returnUrl = billingReturnUrl(SITE_URL);
    const catalogReturn = process.env.MERCADOPAGO_CATALOG_SITE_URL
      ? billingReturnUrl(process.env.MERCADOPAGO_CATALOG_SITE_URL) : returnUrl;
    validatePlan(plan, seller, returnUrl, scope.environment === "test", catalogReturn);
    return reservedCreation({
     reserve: async () => checked(await db.from(billingTable("billing_agreements", billingScope())).insert({ owner_id: owner, catalog_plan_id: plan.id, environment: scope.environment, seller_id: seller,
      amount: offer.catalog.amount, currency: plan.auto_recurring.currency_id }).select().single()) as Agreement,
     create: (a) => mp<MPSubscription>("/preapproval", "POST", {
        reason: catalog.name, external_reference: a.external_reference, payer_email: payerEmail,
        auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: Number(a.amount), currency_id: a.currency },
        back_url: returnUrl, status: "pending",
      }, a.id),
     persist: async (a, s) => {
      // Hosted pending checkout is the documented no-card-token alternative.
      validateSubscription(s, a, seller);
      const url = checkoutUrl(s.init_point);
      checked(await db.rpc("billing_apply_sync_v2", { p_id: a.id, p_token: token,
        p_snapshot: { environment: scope.environment, seller_id: seller, id: s.id, external_reference: s.external_reference, status: s.status, updated_at: s.last_modified, checkout_url: url, next_payment_date: null }, p_payments: [] }));
      return { checkout_url: url };
     },
     failed: async (a, error) => {
      const definitive = error instanceof ProviderError && [400,401,403,422].includes(error.providerStatus);
      await db.from(billingTable("billing_agreements", billingScope())).update({ creation_state: definitive ? "failed" : "uncertain", sync_error: true }).eq("id", a.id).eq("creation_state", "creating");
     },
    });
  });
}
export async function cancel(owner: string, db = adminDb()) {
  await assertOwner(owner, db);
  return withLock(db, `billing:${owner}`, async (token) => {
    await rateLimit(db, `cancel:${owner}`, 5, 600);
    const a = await currentAgreement(db, owner);
    if (!a) throw new BillingError("NO_SUBSCRIPTION", 404);
    const seller = await sellerId(), s = await remoteFor(a, db);
    if (!s) throw new BillingError("AWAITING_RECONCILIATION");
    validateSubscription(s, a, seller);
    if (!["cancelled","canceled"].includes(s.status)) {
      await mp(`/preapproval/${encodeURIComponent(s.id)}`, "PUT", { status: "cancelled" }, `cancel-${a.id}`);
    }
    // Re-read canonical state; a successful PUT alone does not grant access.
    const fresh = await mp<MPSubscription>(`/preapproval/${encodeURIComponent(s.id)}`);
    await applyRemote(db, a, fresh, token, seller);
    return { canceled: ["cancelled","canceled"].includes(fresh.status) };
  });
}
export async function status(owner: string, refresh: boolean, db = adminDb()): Promise<BillingStatus> {
  await assertOwner(owner, db);
  const offer = checkoutOffer();
  await rateLimit(db, `status:${owner}`, 60, 60);
  let a = await currentAgreement(db, owner);
  if (refresh && a && billingAvailable() && (!a.sync_error || Date.parse(a.reconcile_after) <= Date.now()) && Date.now() - Date.parse(a.last_synced_at || "1970-01-01") > 30000) {
    try { await synchronize(owner, db); } catch { /* Show persisted state and sync_error. */ }
    a = await currentAgreement(db, owner);
  }
  const scope = billingScope();
  const payments = checked(await scopedQuery(db.from(billingTable("subscription_payments", billingScope())).select("id,amount,currency,status,paid_at,coverage_end"), scope).eq("owner_id", owner).order("created_at", { ascending: false }).limit(50));
  const priceConflict = a && a.creation_state !== "failed" && !["cancelled","canceled"].includes(a.status) && Number(a.amount) !== offer.catalog.amount;
  return { catalog: offer.catalog, temporary_price: offer.temporaryPrice, available: billingAvailable() && !priceConflict, entitlements: await getUserEntitlements(owner, db),
    agreement: a ? { id: a.id, amount: Number(a.amount), currency: a.currency, status: a.status, creation_state: a.creation_state, next_payment_date: a.next_payment_date,
      last_synced_at: a.last_synced_at, sync_error: a.sync_error } : null, payments: payments || [] };
}

export async function processEvent(key: string, db = adminDb()) {
  const scope = billingScope();
  await sellerId();
  return processBillingEvent(key, {
    lock: (lockKey, work) => withLock(db, lockKey, work),
    load: async (eventKey) => checked(await scopedRows(db, "billing_webhook_events").eq("event_key", eventKey).single()) as BillingEvent,
    validateSubscription: (s) => { requireCondition(String(s.collector_id) === scope.sellerId, "INVALID_SELLER"); },
    update: async (eventKey, values) => {
      // Promotion follows successful canonical subscription/payment verification;
      // ignored or failed legacy notifications retain their unknown provenance.
      const verifiedScope = scope.environment === "production" && values.processing_status === "processed"
        ? { environment: scope.environment, seller_id: scope.sellerId } : {};
      checked(await db.from(billingTable("billing_webhook_events", scope)).update({ ...values, ...verifiedScope }).eq("event_key", eventKey));
    },
    subscription: (id) => mp<MPSubscription>(`/preapproval/${encodeURIComponent(id)}`),
    invoice: (id) => mp<MPInvoice>(`/authorized_payments/${encodeURIComponent(id)}`),
    invoicesForPayment: (id) => readAuthorizedPayments({ payment_id: id }, path => mp<InvoiceSearchPage>(path)),
    findBySubscription: async (id) => checked(await scopedRows(db, "billing_agreements").eq("provider_subscription_id", id).maybeSingle()) as Agreement | null,
    findByReference: async (reference) => checked(await scopedRows(db, "billing_agreements").eq("external_reference", reference).maybeSingle()) as Agreement | null,
    synchronize: async (agreement) => { assertAgreementScope(scope, agreement); await synchronize(agreement.owner_id, db, agreement.id); },
  });
}
export async function reconcile() {
  const scope = billingScope();
  // This endpoint is a production cron only. Test recovery is scoped to the
  // dedicated user's status refresh and verified webhooks.
  if (scope.environment !== "production") throw new BillingError("TEST_RECONCILIATION_DISABLED", 403);
  const db = adminDb(), start = Date.now(); let synced = 0, failed = 0;
  const events = checked(await scopedRows(db, "billing_webhook_events").in("processing_status", ["pending","failed"]).lte("retry_after", new Date().toISOString()).order("retry_after").limit(2));
  for (const event of events || []) { try { await processEvent(event.event_key, db); } catch { failed++; } }
  const agreements = checked(await scopedRows(db, "billing_agreements").neq("creation_state","failed").lte("reconcile_after", new Date().toISOString()).order("reconcile_after").limit(10));
  for (const a of agreements || []) {
    if (Date.now() - start > 30000) break;
    try { await synchronize(a.owner_id, db, a.id); synced++; } catch { failed++; }
  }
  return { synced, failed };
}
