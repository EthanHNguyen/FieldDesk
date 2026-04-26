import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import type { Page } from "@playwright/test";

async function main() {
  mkdirSync("screenshots", { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", (error) => console.log("PAGE ERROR:", error.message));

  console.log("Capturing dashboard...");
  await page.goto("http://localhost:3000");
  await capture(page, "screenshots/00-workflows-dashboard.png");

  console.log("Capturing workflow start...");
  await page.click('button.openWorkflow:has-text("Open")');
  await capture(page, "screenshots/01-capture-intent.png");

  console.log("Capturing analysis...");
  await page.click('button:has-text("Start Analysis")');
  await page.waitForSelector("text=Collecting evidence across", { timeout: 20000 });
  await capture(page, "screenshots/02-search-sources.png");

  console.log("Capturing evidence map...");
  await page.click('button:has-text("Build Evidence Map")');
  await page.waitForSelector("text=Map discovered evidence", { timeout: 20000 });
  await capture(page, "screenshots/03-evidence-map.png");

  console.log("Capturing gaps...");
  await page.click('button:has-text("Surface Gaps")');
  await page.waitForSelector("text=Readiness Assessment", { timeout: 20000 });
  await capture(page, "screenshots/04-surface-gaps.png");

  console.log("Capturing resolve...");
  await page.click('button:has-text("Stage All Demo Evidence")');
  await page.waitForSelector("text=Updated Readiness", { timeout: 20000 });
  await capture(page, "screenshots/05-resolve-recompute.png");

  console.log("Capturing export...");
  await page.click('button:has-text("Generate Final Package")');
  await page.waitForSelector("text=Ready to Route", { timeout: 20000 });
  await capture(page, "screenshots/06-export-dts.png");

  await browser.close();
}

async function capture(page: Page, path: string) {
  await hideDevOverlay(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: true });
}

async function hideDevOverlay(page: Page) {
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-nextjs-toast],
      [data-nextjs-dialog-overlay],
      [data-next-badge-root] {
        display: none !important;
      }
    `
  }).catch(() => undefined);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
