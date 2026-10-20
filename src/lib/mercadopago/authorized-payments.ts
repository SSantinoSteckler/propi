import { BillingError, requireCondition } from "../billing/domain";
import type { MPInvoice } from "../billing/types";

export type InvoiceSearchPage = {
  results: MPInvoice[];
  paging: { offset: number; limit: number; total: number };
};
type InvoiceFilter = { preapproval_id: string } | { payment_id: string };

// This endpoint rejects an explicit `limit`. Keep provider-controlled page sizes
// and require a complete, bounded snapshot before any billing write is allowed.
export async function readAuthorizedPayments(
  filter: InvoiceFilter,
  readPage: (path: string) => Promise<InvoiceSearchPage>,
): Promise<MPInvoice[]> {
  const invoices: MPInvoice[] = [];
  const seen = new Set<string>();
  let offset = 0;
  for (let request = 0; request < 50; request++) {
    const query = new URLSearchParams({ ...filter, offset: String(offset) });
    const page = await readPage(`/authorized_payments/search?${query}`);
    const paging = page?.paging;
    requireCondition(Array.isArray(page?.results) && paging
      && Number.isSafeInteger(paging.total) && paging.total >= 0
      && Number.isSafeInteger(paging.limit) && paging.limit > 0
      && paging.offset === offset && page.results.length <= paging.limit
      && offset + page.results.length <= paging.total, "INVALID_INVOICE_RESPONSE");
    for (const invoice of page.results) {
      requireCondition(invoice && (typeof invoice.id === "string" || typeof invoice.id === "number")
        && String(invoice.id).length > 0 && !seen.has(String(invoice.id)), "INVALID_INVOICE_RESPONSE");
      if ("preapproval_id" in filter) requireCondition(invoice.preapproval_id === filter.preapproval_id, "INVOICE_MISMATCH");
      else requireCondition(String(invoice.payment?.id) === filter.payment_id, "PAYMENT_MISMATCH");
      seen.add(String(invoice.id));
      invoices.push(invoice);
    }
    if (invoices.length > 500) throw new BillingError("SYNC_PAGINATION_LIMIT", 503);
    offset += page.results.length;
    if (offset >= paging.total) return invoices;
    // An empty intermediate page must not look like a successful partial sync.
    requireCondition(page.results.length > 0, "INVALID_INVOICE_RESPONSE");
  }
  throw new BillingError("SYNC_PAGINATION_LIMIT", 503);
}
