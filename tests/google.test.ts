import { test, expect } from "@playwright/test";
import { googleDestination, signInWithGoogle } from "../src/features/auth/google";
import { SITE_URL } from "../src/lib/config";

test("Google usa el proveedor y callback propios sin pedir permisos adicionales", async () => {
  let requested: unknown;
  await signInWithGoogle({
    async signInWithOAuth(options) {
      requested = options;
      return { data: { provider: "google", url: "https://accounts.google.com/" }, error: null };
    },
  });
  expect(requested).toEqual({
    provider: "google",
    options: {
      redirectTo: `${SITE_URL}/login/callback`,
      queryParams: { prompt: "select_account" },
    },
  });
});

test("un fallo al iniciar OAuth se informa al formulario", async () => {
  await expect(signInWithGoogle({
    async signInWithOAuth() { throw new Error("Servicio no disponible"); },
  })).rejects.toThrow("Servicio no disponible");
});

test("Google retoma el onboarding y solo abre el panel con perfil completo", () => {
  expect(googleDestination({ username: null, onboarding_step: 1 })).toBe("/onboarding");
  expect(googleDestination({ username: "agente", onboarding_step: 2 })).toBe("/onboarding");
  expect(googleDestination({ username: null, onboarding_step: 4 })).toBe("/onboarding");
  expect(googleDestination({ username: "agente", onboarding_step: 4 })).toBe("/dashboard");
});
