import { createClient } from "@supabase/supabase-js";
export const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export const supabase = configured
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    )
  : null;
export function db() {
  if (!supabase)
    throw new Error(
      "Falta conectar Supabase. Consultá el README y completá .env.local.",
    );
  return supabase;
}
