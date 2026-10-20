import { defineConfig } from "@playwright/test";

// Estas pruebas ejecutan funciones y Route Handlers en Node, sin abrir un navegador.
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.test.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/unit",
});
