export type Agreement = {
  environment: "legacy" | "test" | "production"; seller_id: string | null;
  id: string; owner_id: string; external_reference: string; provider_subscription_id: string | null;
  catalog_plan_id: string; amount: number; currency: string; status: string;
  creation_state: "creating" | "ready" | "uncertain" | "failed";
  checkout_url: string | null; provider_updated_at: string | null; next_payment_date: string | null;
  last_synced_at: string | null; sync_error: boolean; recovery_offset: number; reconcile_after: string;
};
export type Recurring = { frequency: number; frequency_type: string; transaction_amount: number; currency_id: string; free_trial?: unknown; repetitions?: number; end_date?: string };
export type MPPlan = { id: string; collector_id: number; status: string; reason: string; back_url: string; auto_recurring: Recurring };
export type MPSubscription = { id: string; collector_id: number; payer_id?: number; external_reference: string; status: string; preapproval_plan_id?: string; init_point?: string; last_modified: string; next_payment_date?: string; auto_recurring: Recurring };
export type MPInvoice = { id: string | number; preapproval_id: string; external_reference?: string; transaction_amount: string | number; currency_id: string; debit_date: string; last_modified: string; status: string; payment?: { id?: number | string; status?: string } };
export type MPPayment = { id: number | string; collector_id: number; payer?: { id?: string | number }; status: string; transaction_amount: number; transaction_amount_refunded?: number; currency_id: string; date_approved?: string; date_last_updated: string };
export type VerifiedPayment = {
  invoice_id: string; payment_id: string | null; preapproval_id: string; amount: number; currency: string;
  status: string; invoice_status: string; verified: boolean; paid_at: string | null;
  coverage_start: string | null; coverage_end: string | null; updated_at: string;
};
export type Entitlements = { plan: "free" | "pro"; premium: boolean; access_until: string | null };
export type BillingStatus = {
  temporary_price?: boolean;
  catalog: { name: string; amount: number; currency: string }; available: boolean;
  entitlements: Entitlements; agreement: Pick<Agreement,"id"|"amount"|"currency"|"status"|"creation_state"|"next_payment_date"|"last_synced_at"|"sync_error"> | null;
  payments: { id: string; amount: number; currency: string; status: string; paid_at: string | null; coverage_end: string | null }[];
};
