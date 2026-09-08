import { expect, test } from "@playwright/test";

test("home DigiLocker option explains it is coming soon", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "Continue with DigiLocker" });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(
    page.getByText("DigiLocker will be available soon", { exact: false }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("sign-in DigiLocker option explains it is coming soon", async ({
  page,
}) => {
  await page.goto("/auth");
  const button = page.getByRole("button", { name: "Continue with DigiLocker" });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "DigiLocker will be available soon" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/auth/);
});

test("case DigiLocker option stays clickable when requester access is not configured", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter citizen demo", exact: true })
    .click();
  await expect(page).toHaveURL(/\/case\//);
  const button = page.getByRole("button", { name: "Connect DigiLocker" });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(
    page.getByText("DigiLocker will be available soon", { exact: false }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/case\//);
});
