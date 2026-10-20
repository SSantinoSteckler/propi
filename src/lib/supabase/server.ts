import "server-only";
import { createClient } from "@supabase/supabase-js";
import { BillingError } from "../billing/domain";
export async function authenticate(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new BillingError("BILLING_NOT_CONFIGURED", 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw new BillingError("UNAUTHENTICATED", 401);
  return data.user;
}
