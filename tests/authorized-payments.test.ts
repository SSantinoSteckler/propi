import { test, expect } from "@playwright/test";
import { readAuthorizedPayments, type InvoiceSearchPage } from "../src/lib/mercadopago/authorized-payments";
import type { MPInvoice } from "../src/lib/billing/types";

const invoice = (id: number): MPInvoice => ({ id, preapproval_id: "subscription", payment: { id: "payment" }, transaction_amount: 14900, currency_id: "ARS", debit_date: "2026-10-20T00:00:00Z", last_modified: "2026-10-20T00:00:00Z", status: "processed" });

test("facturas rechazan limit explícito y recorren páginas reales de 12 sin saltar registros", async () => {
  const all = Array.from({ length: 25 }, (_, i) => invoice(i + 1));
  const offsets: number[] = [];
  const result = await readAuthorizedPayments({ preapproval_id: "subscription" }, async path => {
    const url = new URL(path, "https://provider.invalid");
    expect(url.pathname).toBe("/authorized_payments/search");
    if (url.searchParams.has("limit")) throw new Error("HTTP_400");
    expect(url.searchParams.get("preapproval_id")).toBe("subscription");
    const offset = Number(url.searchParams.get("offset")); offsets.push(offset);
    return { results: all.slice(offset, offset + 12), paging: { offset, limit: 12, total: all.length } };
  });
  expect(offsets).toEqual([0, 12, 24]);
  expect(result).toEqual(all);
});

test("búsqueda por pago recupera también las facturas de páginas posteriores", async () => {
  const rows = [invoice(1), { ...invoice(2), preapproval_id: "other-subscription" }];
  const result = await readAuthorizedPayments({ payment_id: "payment" }, async path => {
    const url = new URL(path, "https://provider.invalid");
    expect(url.searchParams.has("limit")).toBe(false);
    expect(url.searchParams.get("payment_id")).toBe("payment");
    const offset = Number(url.searchParams.get("offset"));
    return { results: rows.slice(offset, offset + 1), paging: { offset, limit: 1, total: 2 } };
  });
  expect(result.map(row => row.preapproval_id)).toEqual(["subscription", "other-subscription"]);
});

test("respuesta vacía completa es válida; respuesta parcial vacía, metadatos inválidos y duplicados fallan", async () => {
  expect(await readAuthorizedPayments({ preapproval_id: "subscription" }, async () => ({ results: [], paging: { offset: 0, limit: 12, total: 0 } }))).toEqual([]);
  for (const bad of [
    { results: [], paging: { offset: 0, limit: 12, total: 1 } },
    { results: [invoice(1)], paging: { offset: 0, limit: 0, total: 1 } },
    { results: [invoice(1)], paging: { offset: 12, limit: 12, total: 13 } },
    { results: [invoice(1)], paging: { offset: 0, limit: 12, total: "1" } },
    { results: [invoice(1), invoice(1)], paging: { offset: 0, limit: 12, total: 2 } },
  ]) {
    await expect(readAuthorizedPayments({ preapproval_id: "subscription" }, async () => bad as InvoiceSearchPage)).rejects.toThrow("INVALID_INVOICE_RESPONSE");
  }
});

test("facturas de otra suscripción o pago no superan la correlación", async () => {
  const page = { results: [invoice(1)], paging: { offset: 0, limit: 12, total: 1 } };
  await expect(readAuthorizedPayments({ preapproval_id: "other" }, async () => page)).rejects.toThrow("INVOICE_MISMATCH");
  await expect(readAuthorizedPayments({ payment_id: "other" }, async () => page)).rejects.toThrow("PAYMENT_MISMATCH");
});

test("paginación tiene un presupuesto finito y no devuelve un snapshot incompleto", async () => {
  let calls = 0;
  await expect(readAuthorizedPayments({ preapproval_id: "subscription" }, async path => {
    calls++;
    const offset = Number(new URL(path, "https://provider.invalid").searchParams.get("offset"));
    return { results: [invoice(offset + 1)], paging: { offset, limit: 1, total: 100 } };
  })).rejects.toThrow("SYNC_PAGINATION_LIMIT");
  expect(calls).toBe(50);
});

test("un error del proveedor se propaga sin devolver las páginas ya recibidas", async () => {
  let calls = 0;
  await expect(readAuthorizedPayments({ preapproval_id: "subscription" }, async () => {
    if (++calls === 2) throw new Error("PROVIDER_UNAVAILABLE");
    return { results: [invoice(1)], paging: { offset: 0, limit: 1, total: 2 } };
  })).rejects.toThrow("PROVIDER_UNAVAILABLE");
});
