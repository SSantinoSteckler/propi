import { BillingError } from "../billing/domain";
import { logAdminAuthFailure } from "./admin-diagnostics";

// Administrative REST only. The official SDK remains responsible for queries;
// this final fetch boundary prevents opaque keys becoming Bearer JWTs.
export function createAdminFetch(url: string, key: string, send: typeof fetch = fetch): typeof fetch {
  if (typeof window !== "undefined" || !process.versions?.node || /\s|["'`]/.test(key) || key.startsWith("sb_publishable_")) throw new BillingError("INVALID_ADMIN_CONFIGURATION", 503);
  const origin = new URL(url).origin;
  return async (input, options) => {
    const target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (target.origin !== origin || !target.pathname.startsWith("/rest/v1/")) throw new BillingError("INVALID_ADMIN_DESTINATION", 503);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(options?.headers).forEach((value, name) => headers.set(name, value));
    headers.set("apikey", key);
    if (key.startsWith("sb_secret_")) headers.delete("authorization");
    else headers.set("authorization", `Bearer ${key}`);
    headers.set("user-agent", `propi-billing-server/1.0 Node.js/${process.versions.node}`);
    const response = await send(input, { ...options, headers, redirect: "error", signal: options?.signal || AbortSignal.timeout(10000) });
    await logAdminAuthFailure(response, key, headers, target.pathname);
    return response;
  };
}
