import { test as base, expect } from "@playwright/test";

// Las pruebas funcionales no dependen de fuentes o fotos de terceros.
export const test = base.extend<{ localAssetsOnly: void }>({
  localAssetsOnly: [async ({ page }, use) => {
    await page.route(
      /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|images\.unsplash\.com|images\.pexels\.com|videos\.pexels\.com)\//,
      (route) => route.abort(),
    );
    await page.route("**/media/hero-interior.mp4", (route) => route.abort());
    await use();
  }, { auto: true }],
});
export { expect };
