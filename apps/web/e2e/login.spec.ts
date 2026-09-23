import { expect, test } from "@playwright/test";

test("login screen is usable on a phone viewport", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Masuk" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Kata sandi")).toBeVisible();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByText("Masukkan email yang valid")).toBeVisible();
});
