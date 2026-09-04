import { expect, test } from "@playwright/test";

test("citizen creates a case, uploads evidence, and receives the operator fund update", async ({
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
  await expect(
    operator.getByRole("heading", { name: "Case coordination queue" }),
  ).toBeVisible();

  const citizenContext = await browser.newContext();
  const citizen = await citizenContext.newPage();
  await citizen.goto("/");
  await citizen.getByRole("button", { name: "Enter citizen demo" }).click();
  await expect(citizen).toHaveURL(/\/case\/NCRP-26-847193/);
  await citizen.goto("/report");
  await citizen.getByLabel("How much money did you lose? (₹)").fill("6700");
  await citizen
    .getByLabel("Transaction reference (optional)")
    .fill("SIM-E2E-6700");
  await citizen.getByRole("button", { name: "Continue" }).click();
  await citizen
    .getByRole("button", { name: "Confirm and create case" })
    .click();
  await expect(citizen).toHaveURL(/\/case\/NCRP-\d{2}-\d{6}$/);
  const publicCaseId = citizen.url().split("/").at(-1)!;

  await citizen
    .getByLabel("What is this document?")
    .fill("Synthetic e2e statement");
  await citizen.getByLabel("Choose a file").setInputFiles({
    name: "synthetic-statement.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Synthetic evidence for automated product verification.\n",
    ),
  });
  await citizen.getByRole("button", { name: "Upload document" }).click();
  await expect(
    citizen.getByText(
      "Document received. We have recorded it against your case.",
    ),
  ).toBeVisible();

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
  await operator.getByRole("button", { name: "Record funds secured" }).click();
  await expect(operator.getByRole("status")).toContainText("₹6,700");

  await expect(citizen.locator(".money-split .split.secured dd")).toHaveText(
    "₹6,700",
    { timeout: 15_000 },
  );
  await expect(
    citizen.locator(".toast").getByText("₹6,700 additional funds secured"),
  ).toBeVisible();
  await operatorContext.close();
  await citizenContext.close();
});
