import { test, expect } from "./fixtures";
// Requires a fresh local Supabase with email confirmation disabled and matching NEXT_PUBLIC_*.
test("registro → perfil → publicación → portfolio → colección", async ({
  page,
}) => {
  test.skip(
    process.env.RUN_SUPABASE_E2E !== "1",
    "Requiere Supabase local configurado.",
  );
  const suffix = Date.now().toString(36);
  const username = `e2e-${suffix}`;
  await page.goto("/registro");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`e2e-${suffix}@example.com`);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("E2eClaveSegura!2026");
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(page).toHaveURL(/onboarding/);
  await page.getByLabel("Nombre", { exact: true }).fill("Agente");
  await page.getByLabel("Apellido", { exact: true }).fill("Prueba");
  await page.getByLabel("Ciudad o localidad", { exact: true }).fill("CABA");
  await page.getByLabel("Provincia", { exact: true }).fill("Buenos Aires");
  await page.getByLabel("WhatsApp", { exact: true }).fill("5491100000000");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Tu identidad profesional." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.getByLabel("Nombre de usuario", { exact: true }).fill(username);
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.getByRole("link", { name: "Cargar mi primera propiedad" }).click();
  await page
    .getByLabel("Título de la propiedad")
    .fill("Departamento de prueba automatizada");
  await page
    .getByLabel("Descripción", { exact: true })
    .fill(
      "Propiedad ficticia creada para probar el flujo completo del producto.",
    );
  await page.getByLabel("Precio", { exact: true }).fill("125000");
  await page.getByLabel("Ciudad o localidad", { exact: true }).fill("CABA");
  await page.getByRole("button", { name: "2. Características" }).click();
  await page.getByLabel("Superficie total (m²)").fill("80");
  await page.getByLabel("Superficie cubierta (m²)").fill("60");
  await page.getByLabel("Estado", { exact: true }).selectOption("disponible");
  await page
    .getByRole("button", { name: "Guardar propiedad", exact: true })
    .click();
  await expect(page).toHaveURL(/propiedades\/[a-f0-9-]{36}$/);
  await page.goto("/dashboard/portfolio");
  // Regresión: subir la foto debe actualizar también el header sin navegar.
  await page.locator(".upload-avatar input").setInputFiles("public/og.png");
  const headerAvatar = page.getByRole("link", { name: "Editar mi perfil" }).getByRole("img");
  await expect(headerAvatar).toBeVisible();
  const savedAvatar = await page.getByAltText("Tu foto profesional").getAttribute("src");
  await expect(headerAvatar).toHaveAttribute("src", savedAvatar!);
  await expect.poll(() => headerAvatar.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page
    .getByRole("button", { name: "Publicar portfolio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu portfolio está publicado" }),
  ).toBeVisible();
  await page.goto(`/${username}`);
  await expect(
    page.getByRole("heading", { name: "Agente Prueba", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Departamento de prueba automatizada" }),
  ).toBeVisible();
  await page.goto("/dashboard/colecciones/nueva");
  await page
    .getByLabel("Nombre público")
    .fill("Selección de prueba sin datos de cliente");
  await page.getByRole("checkbox", { name: /Departamento de prueba/ }).check();
  await page.getByRole("button", { name: "Guardar colección" }).click();
  await expect(page).toHaveURL("/dashboard/colecciones");
  await page.getByRole("link", { name: "Abrir colección" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Selección de prueba sin datos de cliente",
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/c\/[a-f0-9]{64}/);
});
