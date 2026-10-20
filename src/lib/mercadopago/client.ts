import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { BillingError } from "../billing/domain";

const deadline = new AsyncLocalStorage<number>();
export function withProviderBudget<T>(work: () => Promise<T>, milliseconds = 45000): Promise<T> {
  return deadline.getStore() ? work() : deadline.run(Date.now() + Math.min(milliseconds, 45000), work);
}

export class ProviderError extends BillingError {
  constructor(public providerStatus: number) { super("PROVIDER_UNAVAILABLE", 503); }
}
export async function mp<T>(path: string, method = "GET", body?: unknown, key?: string): Promise<T> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new BillingError("BILLING_NOT_CONFIGURED", 503);
  const remaining = (deadline.getStore() || Date.now() + 8000) - Date.now();
  if (remaining < 250) throw new BillingError("PROVIDER_TIMEOUT", 503);
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method, cache: "no-store", signal: AbortSignal.timeout(Math.min(8000, remaining)), redirect: "error",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(key ? { "X-Idempotency-Key": key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new ProviderError(response.status);
  return response.json() as Promise<T>;
}
