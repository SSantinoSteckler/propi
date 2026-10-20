import { test, expect } from "./fixtures";

test("Google está disponible en ingreso y registro, separado de recuperación", async ({ page }) => {
  for (const path of ["/login", "/registro"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  }
  await page.goto("/recuperar");
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toHaveCount(0);
});

test("cancelar OAuth muestra una salida segura y limpia los parámetros", async ({ page }) => {
  await page.goto("/login/callback?error=access_denied&error_description=no-publicar");
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos completar el ingreso" })).toBeVisible();
  await expect(page).toHaveURL(/\/login\/callback$/);
  await expect(page.getByText("no-publicar")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByRole("link", { name: "Volver a ingresar" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
