import { test, expect } from "./fixtures";
test("landing → portfolio de ejemplo → ficha → colección", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Todas tus/ })).toBeVisible();
  await page.getByRole("link", { name: "Ver un ejemplo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Martina González", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText(/^PORTFOLIO DE EJEMPLO · Perfiles, propiedades/),
  ).toBeVisible();
  await page.getByRole("link", { name: /Luz, diseño/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Luz, diseño y un balcón para disfrutar",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/ejemplo-coleccion");
  await expect(
    page.getByRole("heading", {
      name: "Tu próximo lugar en la ciudad",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex.*nofollow/,
  );
});
test("rutas privadas requieren iniciar sesión", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Qué bueno verte." }),
  ).toBeVisible();
});
test("Next entrega el portfolio de ejemplo sin JavaScript", async ({
  browser,
  request,
}) => {
  const response = await request.get("/ejemplo");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
  const html = await response.text();
  expect(html).toMatch(/<h1[^>]*>Martina/);
  expect(html).toContain("nonce=");
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: test.info().project.use.baseURL,
  });
  try {
    const page = await context.newPage();
    await page.goto("/ejemplo", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Martina González", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Luz, diseño y un balcón para disfrutar",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
