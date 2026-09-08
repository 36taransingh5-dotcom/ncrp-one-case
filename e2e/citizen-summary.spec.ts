import { expect, test } from "@playwright/test";

test("citizen case summary answers money, current work, action and FIR", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter citizen demo", exact: true })
    .click();
  await expect(page).toHaveURL(/\/case\/NCRP-26-847193/);
  const summary = page.getByRole("region", { name: "Your case" });
  await expect(summary.getByText("₹31,200 of ₹48,500")).toBeVisible();
  await expect(
    summary.getByText("HDFC Bank is responding to a freeze request."),
  ).toBeVisible();
  await expect(summary.getByText("Nothing right now.")).toBeVisible();
  await expect(summary.getByText("Under review")).toBeVisible();
  await expect(summary.getByText("SIM-FIR", { exact: false })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "What has happened so far" }),
  ).toBeVisible();
});
