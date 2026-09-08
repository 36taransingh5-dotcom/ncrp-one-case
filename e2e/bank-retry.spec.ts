import { expect, test } from "@playwright/test";

test("bank freeze retry demo recovers without losing the case or showing HTTP 503", async ({
  browser,
}) => {
  const operatorContext = await browser.newContext();
  const operator = await operatorContext.newPage();
  await operator.goto("/");
  await operator
    .getByRole("button", { name: "Enter operations demo" })
    .first()
    .click();
  await expect(operator).toHaveURL(/\/operations/);
  await operator.getByRole("button", { name: "Reset demo" }).click();
  await expect(operator.getByRole("heading", { name: "Cases" })).toBeVisible();

  const citizenContext = await browser.newContext();
  const citizen = await citizenContext.newPage();
  await citizen.goto("/");
  await citizen.getByRole("button", { name: "Enter citizen demo" }).click();
  await expect(citizen).toHaveURL(/\/case\/NCRP-26-847193/);
  await citizen.goto("/report");
  await citizen
    .getByLabel("What happened?")
    .fill(
      "Synthetic report: a caller impersonated a bank and induced an unauthorised UPI payment. The caller contacted me on a messaging app and claimed my account needed urgent verification. I discovered the loss when I checked my synthetic statement and kept the chat screenshots.",
    );
  await citizen.getByLabel("How much money did you lose? (₹)").fill("2100");
  await citizen.getByLabel("When did it happen?").fill("2026-09-08T14:15");
  await citizen
    .getByLabel("Incident location / state")
    .fill("Synthetic Delhi location");
  await citizen
    .getByLabel("Bank, wallet or merchant name")
    .fill("Example Demo Bank");
  await citizen
    .getByLabel("Date of transaction", { exact: true })
    .fill("2026-09-08");
  await citizen
    .getByLabel("I confirm all information", { exact: false })
    .check();
  await citizen.getByRole("button", { name: "Continue" }).click();
  await citizen
    .getByRole("button", { name: "Confirm and create case" })
    .click();
  await expect(citizen).toHaveURL(/\/case\/NCRP-\d{2}-\d{6}$/);
  const publicCaseId = citizen.url().split("/").at(-1)!;

  await operator.reload();
  await operator.getByLabel("Search").fill(publicCaseId);
  await operator.getByRole("button", { name: publicCaseId }).click();
  await expect(
    operator.getByRole("heading", { name: new RegExp(publicCaseId) }),
  ).toBeVisible();
  await operator
    .getByRole("button", { name: "Identify beneficiary bank" })
    .click();
  await expect(operator.getByRole("status")).toContainText(
    "Beneficiary bank identified recorded",
  );
  await operator
    .getByRole("button", { name: "Send freeze (bank retry demo)" })
    .click();
  await expect(
    operator.getByRole("heading", {
      name: "Bank temporarily unavailable — retry queued",
    }),
  ).toBeVisible();
  await expect(
    operator.getByRole("region", { name: "Command centre" }),
  ).toContainText("Bank temporarily unavailable — retry queued");
  await expect(operator.locator("body")).not.toContainText("HTTP 503");
  await expect(operator.locator("body")).not.toContainText(
    "Sandbox unavailable",
  );

  await citizen.reload();
  await expect(citizen.getByText("Freeze request sent").first()).toBeVisible();
  await expect(citizen.locator("body")).not.toContainText("HTTP 503");
  await expect(citizen.locator("body")).not.toContainText(
    "Sandbox unavailable",
  );

  await operator.getByRole("button", { name: "Retry bank request" }).click();
  await expect(
    operator.getByRole("heading", { name: "Bank acknowledgement received" }),
  ).toBeVisible();
  await expect(operator.getByRole("status")).toContainText(
    "Bank acknowledgement received",
  );

  await expect(
    citizen.getByText("Bank acknowledgement received").first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    citizen
      .getByText(
        "The bank confirmed it received the freeze request. You do not need to start over.",
      )
      .first(),
  ).toBeVisible();
  await expect(citizen.locator("body")).not.toContainText("HTTP 503");
  await expect(citizen.locator("body")).not.toContainText(
    "Sandbox unavailable",
  );

  await operatorContext.close();
  await citizenContext.close();
});
