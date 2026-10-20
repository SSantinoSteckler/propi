import { test, expect } from "./fixtures";

test("la portada respeta movimiento reducido y mantiene los enlaces", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const videoRequests: string[] = [];
  page.on("request", (request) => { if (request.resourceType() === "media") videoRequests.push(request.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Todas tus/ })).toBeVisible();
  await page.getByRole("button", { name: "Activar modo oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".hero-film video")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Crear mi portfolio gratis", exact: true }).first()).toHaveAttribute("href", "/registro");
  await expect(page.getByRole("link", { name: "Ver un ejemplo", exact: true })).toHaveAttribute("href", "/ejemplo");
  expect(videoRequests).toEqual([]);
});

test("si el video falla se conserva una portada utilizable en ambas paletas", async ({ page }) => {
  let mediaFailed = false;
  page.on("requestfailed", (request) => { if (request.resourceType() === "media") mediaFailed = true; });
  await page.goto("/");
  const hero = page.getByRole("heading", { name: /Todas tus/ });
  await expect(hero).toBeVisible();
  if (test.info().project.name === "chromium") await expect.poll(() => mediaFailed).toBe(true);
  await page.getByRole("button", { name: "Activar modo oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(hero).toBeVisible();
  await expect(page.getByRole("button", { name: "Pausar video de fondo" })).toHaveCount(0);
});
