import { BillingError, requireCondition } from "./domain";
import type { Agreement } from "./types";
import { isHostedDeployment, isNetlifyPreview } from "../deployment";

export const TEST_SELLER_ID = "3779671542";
export type BillingScope = { environment: "test" | "production"; sellerId: string; testUserId?: string };
type Environment = Record<string, string | undefined>;

// No credentials or browser-provided values determine the owner of a test.
export function billingScope(env: Environment = process.env): BillingScope {
  if (isNetlifyPreview(env)) throw new BillingError("BILLING_PREVIEW_DISABLED", 503);
  const environment = env.MERCADOPAGO_ENVIRONMENT || "production";
  const sellerId = env.MERCADOPAGO_SELLER_ID;
  if (!["test", "production"].includes(environment) || !sellerId || !/^[1-9][0-9]{0,19}$/.test(sellerId)) throw new BillingError("BILLING_NOT_CONFIGURED", 503);
  if (environment === "test") {
    if (isHostedDeployment(env) || sellerId !== TEST_SELLER_ID || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.BILLING_TEST_USER_ID || "")) throw new BillingError("INVALID_TEST_CONFIGURATION", 503);
    return { environment, sellerId, testUserId: env.BILLING_TEST_USER_ID!.toLowerCase() };
  }
  if (sellerId === TEST_SELLER_ID) throw new BillingError("INVALID_SELLER", 503);
  return { environment: "production", sellerId };
}

export function assertScopeOwner(scope: BillingScope, owner: string) {
  if (scope.environment === "test" && owner !== scope.testUserId) throw new BillingError("TEST_USER_ONLY", 403);
}

export function assertSeller(scope: BillingScope, seller: { id: number | string; site_id: string; tags?: string[] }) {
  requireCondition(String(seller.id) === scope.sellerId && seller.site_id === "MLA", "INVALID_SELLER");
  requireCondition(scope.environment === "test" ? seller.tags?.includes("test_user") : !seller.tags?.includes("test_user"), "INVALID_SELLER");
}

export function assertAgreementScope(scope: BillingScope, agreement: Agreement) {
  assertScopeOwner(scope, agreement.owner_id);
  requireCondition((agreement.environment === scope.environment && agreement.seller_id === scope.sellerId)
    || (scope.environment === "production" && agreement.environment === "legacy" && agreement.seller_id === null), "BILLING_SCOPE_MISMATCH");
}

// Legacy is not a verified seller or a production classification.
export function sellerFilter(scope: BillingScope) {
  return scope.environment === "production"
    ? `and(environment.eq.production,seller_id.eq.${scope.sellerId}),and(environment.eq.legacy,seller_id.is.null)`
    : `and(environment.eq.test,seller_id.eq.${scope.sellerId})`;
}

export type BillingTable = "billing_agreements" | "subscription_payments" | "billing_webhook_events";
const testTables: Record<BillingTable, string> = { billing_agreements: "billing_test_agreements", subscription_payments: "billing_test_payments", billing_webhook_events: "billing_test_webhook_events" };
export function billingTable(table: BillingTable, scope: BillingScope) { return scope.environment === "test" ? testTables[table] : table; }

export function scopedQuery<T>(query: T, scope: BillingScope): T {
  // Preserve the caller's PostgREST projection without recursively expanding its
  // generated conditional types. Both filters retain the same result shape.
  const builder = query as { or(filters: string): unknown };
  return builder.or(sellerFilter(scope)) as T;
}

export function billingReturnUrl(site: string) {
  let url: URL;
  try { url = new URL(site); } catch { throw new BillingError("INVALID_RETURN_URL", 503); }
  requireCondition(url.protocol === "https:" && url.origin === site && !url.username && !url.password && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "INVALID_RETURN_URL");
  return `${url.origin}/dashboard/billing/return`;
}
