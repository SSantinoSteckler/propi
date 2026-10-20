import { test, expect } from "./fixtures";

test("alterna paletas y conserva la elección en navegación, recarga y HTML del servidor", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Activar modo oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Activar modo claro" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe("rgb(25, 27, 30)");
  const [red, green, blue] = await page.locator(".hero-actions .btn").evaluate((button) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = getComputedStyle(button).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data);
  });
  expect(green).toBeGreaterThan(red);
  expect(green).toBeGreaterThan(blue);

  await page.getByRole("link", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Activar modo claro" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const response = await context.request.get("/ejemplo");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toMatch(/<html[^>]*data-theme="dark"/);
  expect(html).toContain('content="#191b1e"');

  const toggle = page.getByRole("button", { name: "Activar modo claro" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe("rgb(250, 248, 244)");
  await expect.poll(async () => (await context.cookies()).find((cookie) => cookie.name === "propi-theme")?.value).toBe("light");
});
