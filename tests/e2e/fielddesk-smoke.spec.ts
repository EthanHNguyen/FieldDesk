import { expect, test } from "@playwright/test";

test("dashboard opens TDY readiness and completes the static workflow", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "Workflows" })).toBeVisible();
  const tdyCard = page.locator(".workflowCard", { hasText: "TDY Travel Readiness" });
  await expect(tdyCard).toBeVisible();
  await expect(page.getByText("Demo Training Site")).toHaveCount(0);

  await tdyCard.getByRole("button", { name: /Open/ }).click();

  await expect(page.getByRole("heading", { name: /Mission Intent/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "TDY Travel Readiness" })).toBeVisible();
  await expect(page.locator("textarea")).toHaveValue(/Demo Training Site/);
  await page.getByRole("button", { name: /Start Analysis/ }).click();

  await expect(page.getByRole("heading", { name: /Search Sources/ })).toBeVisible();
  await expect(page.getByText("Found Demo Training Site per diem rates")).toBeVisible();
  await page.getByRole("button", { name: "Build Evidence Map" }).click();

  await expect(page.getByRole("heading", { name: /Evidence Map/ })).toBeVisible();
  await expect(page.getByText("Demo Training Site rate data")).toBeVisible();
  await page.getByRole("button", { name: "Surface Gaps" }).click();

  await expect(page.getByRole("heading", { name: /Readiness Assessment/ })).toBeVisible();
  await expect(page.getByText("72")).toBeVisible();
  await expect(page.locator(".scoreBlock em", { hasText: "High review risk" })).toBeVisible();
  await page.getByRole("button", { name: "Stage All Demo Evidence" }).click();

  await expect(page.getByRole("heading", { name: /Updated Readiness/ })).toBeVisible();
  await expect(page.getByText("91")).toBeVisible();
  await expect(page.getByText("funding_memo.pdf")).toBeVisible();
  await page.getByRole("button", { name: /Generate Final Package/ }).click();

  await expect(page.getByText("Ready to Route")).toBeVisible();
  await expect(page.getByRole("heading", { name: "DTS Authorization Draft" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Demo Training Site", exact: true })).toBeVisible();
});

test("manual issue resolution stages selected actions before recompute", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.locator(".workflowCard", { hasText: "TDY Travel Readiness" }).getByRole("button", { name: /Open/ }).click();
  await page.getByRole("button", { name: /Start Analysis/ }).click();
  await page.getByRole("button", { name: "Build Evidence Map" }).click();
  await page.getByRole("button", { name: "Surface Gaps" }).click();

  await expect(page.getByRole("heading", { name: /Readiness Assessment/ })).toBeVisible();
  await page.getByRole("button", { name: "Stage Selected Action" }).click();
  await expect(page.getByRole("button", { name: "Funding source missing" })).toContainText("Missing");

  await page.getByRole("button", { name: "Stage Selected Action" }).click();
  await expect(page.getByRole("button", { name: "Rental vehicle justification weak" })).toContainText("Weak");

  await page.getByLabel("Rental vehicle justification").fill(
    "Rental vehicles are required because the training site, lodging, and equipment pickup points are separated and no unit shuttle is available during the training window."
  );
  await page.getByRole("button", { name: "Stage Selected Action" }).click();

  await expect(page.getByRole("button", { name: "Recompute Readiness" })).toBeVisible();
  await page.getByRole("button", { name: "Recompute Readiness" }).click();

  await expect(page.getByRole("heading", { name: /Updated Readiness/ })).toBeVisible();
  await expect(page.getByText("91")).toBeVisible();
  await page.getByRole("button", { name: /Generate Final Package/ }).click();
  await expect(page.getByRole("heading", { name: "DTS Authorization Draft" })).toBeVisible();
});

test("source toggles degrade evidence through the agent API", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.locator(".workflowCard", { hasText: "TDY Travel Readiness" }).getByRole("button", { name: /Open/ }).click();
  await page.getByRole("button", { name: "GSA" }).click();
  await page.getByRole("button", { name: /Start Analysis/ }).click();

  await expect(page.getByRole("heading", { name: /Search Sources/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /GSA Disabled Source disabled/ })).toBeVisible();
  await page.getByRole("button", { name: "Build Evidence Map" }).click();

  await expect(page.getByRole("row", { name: /Per diem estimate Source disabled GSA.*Missing/ })).toBeVisible();
});
