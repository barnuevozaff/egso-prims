import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { APP_URL, createStaff, launch, newPage, resetEmulators, shot, signIn } from "./browser";

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
  await createStaff("admin@alaminos.gov.ph", "Administrator", {}, "Ana Reyes");
  await createStaff("dept@alaminos.gov.ph", "Department User", {}, "Dante Cruz");
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

/** A synthetic document written with the emulator's admin token (emulator only). */
async function seedDoc(path: string, data: Record<string, string | number | null>) {
  const fields = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k,
      v === null ? { nullValue: null } : typeof v === "number" ? { integerValue: String(v) } : { stringValue: v },
    ]),
  );
  const res = await fetch(`http://127.0.0.1:8085/v1/projects/demo-egso-prims/databases/(default)/documents/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Could not seed ${path}: ${res.status}`);
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

  it("a Department User reads Records Management but is offered no changes", async () => {
    const at = "2026-10-19T00:00:00.000Z";
    await seedDoc("disposition_schedules/rds-e2e", {
      id: "rds-e2e", schedule_no: "RDS-2026-000009", agency_name: "Test Agency (e2e)", agency_address: "Test address",
      date_prepared: "2026-10-19", status: "Draft", created_at: at, updated_at: at,
    });
    await seedDoc("record_series/ser-e2e", {
      id: "ser-e2e", schedule_id: "rds-e2e", item_number: 1, title_and_description: "Vouchers (test)",
      retention_active: 1, retention_storage: 1, retention_total: 2, created_at: at, updated_at: at,
    });
    await session("records-readonly", async (page) => {
      await signIn(page, "dept@alaminos.gov.ph");
      await page.goto(`${APP_URL}/records`);
      await page.getByText("RDS-2026-000009").first().waitFor({ timeout: 30_000 });
      expect(await page.getByRole("button", { name: "New Schedule" }).count()).toBe(0);
      await page.getByText("RDS-2026-000009").first().click();
      await page.getByText("Vouchers (test)").first().waitFor({ timeout: 30_000 });
      for (const name of ["Edit", "Delete"]) {
        expect(await page.getByRole("button", { name, exact: true }).count()).toBe(0);
      }
      await shot(page, "63-records-readonly");

      await page.goto(`${APP_URL}/records/new`);
      await page.waitForLoadState("domcontentloaded");
      expect(await page.getByRole("button", { name: "Create Schedule" }).count()).toBe(0);

      await page.goto(`${APP_URL}/records/shelves`);
      await page.getByRole("heading", { name: "Records Room" }).waitFor();
      expect(await page.getByRole("button", { name: "Add Shelf" }).count()).toBe(0);
    });
  });
});
