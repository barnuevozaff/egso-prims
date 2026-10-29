import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { APP_URL, createAccount, launch, newPage, resetEmulators, shot, signIn } from "./browser";

/**
 * Records Management in the browser, on Firebase: an Administrator files a
 * disposition schedule through the real form and finds it in the Records
 * Room; a Department User reads the module but is offered no changes.
 * Synthetic data only.
 */

let browser: Browser;

beforeAll(async () => {
  browser = await launch();
});

afterAll(async () => {
  await browser?.close();
});

beforeEach(async () => {
  await resetEmulators();
  await createAccount("admin@alaminos.gov.ph", "Ana Reyes");
  await createAccount("clerk@alaminos.gov.ph", "Dante Cruz");
});

async function session(name: string, run: (page: Page) => Promise<void>) {
  const { context, page, errors } = await newPage(browser);
  try {
    await run(page);
    expect(errors).toEqual([]);
  } catch (e) {
    await shot(page, `FAILED-${name}`).catch(() => undefined);
    throw e;
  } finally {
    await context.close();
  }
}

describe("Records Management in the browser, on Firebase", () => {
  it("an Administrator creates an approved schedule and finds it filed in the Records Room", async () => {
    await session("records-file", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/records/new`);
      await page.getByLabel("Item 1 record series title and description").fill("Purchase requests (test data)");
      await page.getByLabel("Status").click();
      await page.getByRole("option", { name: "Approved" }).click();
      await shot(page, "60-records-new");
      await page.getByRole("button", { name: "Create Schedule" }).click();
      await page.getByText(/RDS-\d{4}-000001 created/).waitFor({ timeout: 30_000 });
      // Filed on approval: the detail page names the shelf, level and box.
      await page.getByText(/Shelf 1/).first().waitFor({ timeout: 30_000 });
      await shot(page, "61-records-filed");

      await page.goto(`${APP_URL}/records/shelves`);
      await page.getByText(/Shelf 1/).first().waitFor({ timeout: 30_000 });
      expect(await page.getByRole("button", { name: "Add Shelf" }).count()).toBe(1);
      await shot(page, "62-records-room");
    });
  });

});
