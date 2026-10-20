import "server-only";
import { createClient } from "@supabase/supabase-js";
import { BillingError } from "../billing/domain";
export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new BillingError("BILLING_NOT_CONFIGURED", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
