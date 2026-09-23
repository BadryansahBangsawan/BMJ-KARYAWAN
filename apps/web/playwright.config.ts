import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://karyawan.badry.engineer",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Pixel 7"] } }],
});
