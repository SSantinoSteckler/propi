import { test, expect } from "@playwright/test";
import { billingScope, assertScopeOwner, assertSeller, assertAgreementScope, scopedQuery, billingReturnUrl, billingTable, TEST_SELLER_ID } from "../src/lib/billing/scope";
import { validatePlan } from "../src/lib/billing/domain";
import type { Agreement, MPPlan } from "../src/lib/billing/types";

const owner = "99999999-9999-4999-8999-999999999999";
const env = { MERCADOPAGO_ENVIRONMENT: "test", MERCADOPAGO_SELLER_ID: TEST_SELLER_ID, BILLING_TEST_USER_ID: owner };
const scope = billingScope(env);
const agreement = { owner_id: owner, environment: "test", seller_id: TEST_SELLER_ID } as Agreement;
const plan: MPPlan = { id: "existing-plan", collector_id: Number(TEST_SELLER_ID), status: "active", reason: "Propi Premium", back_url: "https://propi-psi.vercel.app/dashboard/billing/return", auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 14900, currency_id: "ARS" } };

test("modo de prueba exige UUID y vendedor fijo y no admite ejecución en Vercel", () => {
  expect(scope.testUserId).toBe(owner);
  for (const change of [{ BILLING_TEST_USER_ID: undefined }, { BILLING_TEST_USER_ID: "" }, { MERCADOPAGO_SELLER_ID: "101" }, { VERCEL: "1" }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "preview" }, { MERCADOPAGO_ENVIRONMENT: "typo" }]) expect(() => billingScope({ ...env, ...change })).toThrow();
});
test("producción queda cerrada sin vendedor explícito y rechaza al vendedor ficticio", () => {
  expect(() => billingScope({})).toThrow();
  expect(() => billingScope({ MERCADOPAGO_SELLER_ID: TEST_SELLER_ID })).toThrow();
  expect(billingScope({ MERCADOPAGO_SELLER_ID: "101" }).environment).toBe("production");
});
test("operaciones de prueba rechazan cualquier otro usuario antes de escribir", () => {
  expect(() => assertScopeOwner(scope, owner)).not.toThrow();
  expect(() => assertScopeOwner(scope, "11111111-1111-4111-8111-111111111111")).toThrow("TEST_USER_ONLY");
});
test("identidad del token debe coincidir con ID, país y marcador de cuenta ficticia", () => {
  expect(() => assertSeller(scope, { id: TEST_SELLER_ID, site_id: "MLA", tags: ["test_user"] })).not.toThrow();
  for (const seller of [{ id: "101", site_id: "MLA", tags: ["test_user"] }, { id: TEST_SELLER_ID, site_id: "MLB", tags: ["test_user"] }, { id: TEST_SELLER_ID, site_id: "MLA", tags: [] }]) expect(() => assertSeller(scope, seller)).toThrow();
  expect(() => assertSeller(billingScope({ MERCADOPAGO_SELLER_ID: "101" }), { id: "101", site_id: "MLA", tags: ["test_user"] })).toThrow();
});
test("acuerdos de prueba no pueden correlacionarse con un usuario real o producción", () => {
  expect(() => assertAgreementScope(scope, agreement)).not.toThrow();
  for (const change of [{ owner_id: "real-user" }, { environment: "production" as const }, { seller_id: "101" }, { seller_id: null }]) expect(() => assertAgreementScope(scope, { ...agreement, ...change })).toThrow();
  expect(() => assertAgreementScope(billingScope({ MERCADOPAGO_SELLER_ID: "101" }), agreement)).toThrow();
});
test("consultas del cron y eventos filtran producción y vendedor antes de seleccionar registros", () => {
  const filters: string[] = [];
  const query = { eq: (column: string, value: string) => { filters.push(`${column}=${value}`); return query; }, or: (filter: string) => { filters.push(filter); return query; } };
  scopedQuery(query, billingScope({ MERCADOPAGO_SELLER_ID: "101" }));
  expect(filters).toEqual(["and(environment.eq.production,seller_id.eq.101),and(environment.eq.legacy,seller_id.is.null)"]);
  filters.length = 0;
  scopedQuery(query, scope);
  expect(filters).toEqual([`and(environment.eq.test,seller_id.eq.${TEST_SELLER_ID})`]);
  expect(billingTable("billing_agreements",scope)).toBe("billing_test_agreements");
  expect(billingTable("billing_webhook_events",scope)).toBe("billing_test_webhook_events");
  expect(billingTable("subscription_payments",scope)).toBe("billing_test_payments");
});
test("el catálogo ficticio se reutiliza sin alterar su URL y el checkout vuelve al túnel", () => {
  const original = structuredClone(plan), returnUrl = billingReturnUrl("https://local-propi.example");
  expect(returnUrl).toBe("https://local-propi.example/dashboard/billing/return");
  expect(() => validatePlan(plan, TEST_SELLER_ID, returnUrl, true)).not.toThrow();
  expect(plan).toEqual(original);
  expect(() => validatePlan(plan, TEST_SELLER_ID, returnUrl)).toThrow();
  expect(() => validatePlan({ ...plan, collector_id: 101 }, "101", returnUrl, true)).toThrow();
  expect(() => validatePlan({ ...plan, back_url: "javascript:alert(1)" }, TEST_SELLER_ID, returnUrl, true)).toThrow();
  expect(() => validatePlan({ ...plan, auto_recurring: { ...plan.auto_recurring, transaction_amount: 1 } }, TEST_SELLER_ID, returnUrl, true)).toThrow();
});
test("retorno rechaza HTTP, credenciales, rutas, query y fragmentos", () => {
  for (const site of ["http://localhost:3100", "https://user:pass@propi.example", "https://propi.example/path", "https://propi.example?next=evil", "https://propi.example/#fragment"]) expect(() => billingReturnUrl(site)).toThrow();
});
