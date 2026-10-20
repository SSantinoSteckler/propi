import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL } from "../../lib/config";

export async function signInWithGoogle(
  auth: Pick<SupabaseClient["auth"], "signInWithOAuth">,
) {
  const { error } = await auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${SITE_URL}/login/callback`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
}

export function googleDestination(profile: {
  username: string | null;
  onboarding_step: number;
}) {
  return profile.username && profile.onboarding_step >= 4
    ? "/dashboard"
    : "/onboarding";
}
