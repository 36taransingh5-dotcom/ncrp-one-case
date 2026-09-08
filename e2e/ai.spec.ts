import { test, expect } from "@playwright/test";

test("simple report hides optional details and supports payment shortcuts", async ({
  page,
}) => {
  await page.goto("/report");
  await expect(
    page.getByLabel("Suspect name (if known)", { exact: true }),
  ).toBeHidden();
  await expect(page.getByLabel("Identity document type")).toBeHidden();
  await page.getByRole("button", { name: "I don’t know the bank" }).click();
  await expect(page.getByLabel("Bank, wallet or merchant name")).toHaveValue(
    "Unknown",
  );
  await page.getByLabel("When did it happen?").fill("2026-09-08T14:15");
  await page.getByRole("button", { name: "Use the incident date" }).click();
  await expect(
    page.getByLabel("Date of transaction", { exact: true }),
  ).toHaveValue("2026-09-08");
});

test("AI auth and unavailable-provider behaviour leave manual reporting available", async ({
  page,
  request,
}) => {
  const anonymous = await request.post("/api/ai/analyse-complaint", {
    data: {
      description:
        "A synthetic complaint describing a bank impersonation scam.",
    },
  });
  expect(anonymous.status()).toBe(401);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter citizen demo", exact: true })
    .click();
  await expect(page).toHaveURL(/\/case\//);
  const wrongRole = await page.request.post("/api/ai/case-brief", {
    data: { caseId: "NCRP-26-847193" },
  });
  expect(wrongRole.status()).toBe(401);
  await page.goto("/report");
  const institutionInput = page.getByLabel("Date of transaction");
  const aiSection = page.getByRole("region", { name: "AI report analysis" });
  const institutionBox = await institutionInput.boundingBox();
  const aiBox = await aiSection.boundingBox();
  expect(institutionBox).not.toBeNull();
  expect(aiBox).not.toBeNull();
  expect(aiBox!.y).toBeGreaterThan(institutionBox!.y + institutionBox!.height);
  await page
    .getByLabel("What happened?")
    .fill(
      "I received a synthetic WhatsApp call claiming to be from SBI and paid ₹48,500 by UPI.",
    );
  await page.route("**/api/ai/analyse-complaint", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error:
          "AI analysis is temporarily unavailable. You can continue normally.",
      },
    }),
  );
  await page.getByRole("button", { name: "Analyse report" }).click();
  await expect(
    page.getByText(
      "AI analysis is temporarily unavailable. You can continue normally.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeEnabled();
});

test("AI suggestions require explicit acceptance and remain editable", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter citizen demo", exact: true })
    .click();
  await expect(page).toHaveURL(/\/case\//);
  await page.goto("/report");
  await page
    .getByLabel("What happened?")
    .fill(
      "I received a synthetic WhatsApp call claiming to be from SBI and paid ₹48,500 by UPI.",
    );
  await page.getByLabel("How much money did you lose? (₹)").fill("1200");
  await page.route("**/api/ai/analyse-complaint", (route) =>
    route.fulfill({
      json: {
        result: {
          summary: "Reported bank impersonation over WhatsApp.",
          fraudType: "Bank impersonation / phishing",
          reportedAmount: 48500,
          paymentChannel: "UPI",
          sourceInstitution: null,
          beneficiaryInstitution: null,
          transactionReferences: [],
          incidentDate: null,
          incidentTime: null,
          evidenceMentioned: [],
          known: ["₹48,500 reported"],
          inferred: ["Possible impersonation"],
          missingInformation: ["Transaction reference"],
          recommendedAction: "REQUEST_TRANSACTION_REFERENCE",
          reason: "Reference missing",
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Analyse report" }).click();
  await expect(
    page.getByText("Reported bank impersonation over WhatsApp."),
  ).toBeVisible();
  await expect(page.getByLabel("How much money did you lose? (₹)")).toHaveValue(
    "1200",
  );
  await page
    .getByRole("button", { name: "Use suggestions in editable fields" })
    .click();
  await expect(page.getByLabel("How much money did you lose? (₹)")).toHaveValue(
    "48500",
  );
  await page.getByLabel("How much money did you lose? (₹)").fill("48000");
  await expect(page.getByLabel("How much money did you lose? (₹)")).toHaveValue(
    "48000",
  );
});
