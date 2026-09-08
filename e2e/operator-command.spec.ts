import { expect, test } from "@playwright/test";

test("operator command centre summarises the selected case without inventing AI or SLA", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter operations demo" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/operations/);
  const command = page.getByRole("region", { name: "Command centre" });
  await expect(command.getByText("Case NCRP-26-847193")).toBeVisible();
  await expect(command.getByText("₹48,500 reported")).toBeVisible();
  await expect(command.getByText("₹31,200")).toBeVisible();
  await expect(command.getByText("₹12,000")).toBeVisible();
  await expect(command.getByText("₹5,300")).toBeVisible();
  await expect(
    command.getByText("HDFC Bank must respond to freeze request"),
  ).toBeVisible();
  await expect(
    command.getByText("waiting for bank acknowledgement"),
  ).toBeVisible();
  await expect(command.getByText("No AI recommendation yet")).toBeVisible();
  await expect(command.getByText("27 min remaining")).toHaveCount(0);
});
