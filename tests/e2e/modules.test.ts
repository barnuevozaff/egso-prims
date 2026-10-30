import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { APP_URL, createAccount, launch, newPage, resetEmulators, shot, signIn } from "./browser";

/**
 * Phase 4 in the browser, on Firebase: what each role is offered in the
 * sidebar, voiding a booking from its list, the comment box naming whoever
 * is signed in, and the utility and violation screens loading from
 * Firestore. Synthetic data only.
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

/** Books a slot the way the public portal does (the create function). */
async function bookPortalReservation(purpose: string) {
  const res = await fetch("http://127.0.0.1:5001/demo-egso-prims/asia-southeast1/createReservation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        input: {
          facilityId: "Session Hall",
          departmentCode: "MO",
          borrower: "Office of the Mayor",
          contactNumber: "0917 000 0000",
          purpose,
          date: "2026-11-05",
          startTime: "08:00",
          endTime: "12:00",
          equipment: [],
          attachments: [],
        },
      },
    }),
  });
  return ((await res.json()) as { result: { id: string; res_number: string } }).result;
}

/** Writes a synthetic document with the emulator's admin token (bypasses rules, emulator only). */
async function seedDoc(path: string, data: Record<string, string | number | null>) {
  const fields = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k,
      v === null ? { nullValue: null } : typeof v === "number" ? { doubleValue: v } : { stringValue: v },
    ]),
  );
  const res = await fetch(`http://127.0.0.1:8085/v1/projects/demo-egso-prims/databases/(default)/documents/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Could not seed ${path}: ${res.status}`);
}

const sidebarLink = (page: Page, name: string) => page.locator("aside").getByRole("button", { name, exact: true });

describe("Phase 4 screens in the browser, on Firebase", () => {
  it("every account sees every sidebar link and Settings (one role, 29 Oct 2026)", async () => {
    for (const email of ["admin@alaminos.gov.ph", "clerk@alaminos.gov.ph"]) {
      await session(`sidebar-${email}`, async (page) => {
        await signIn(page, email);
        await sidebarLink(page, "Dashboard").waitFor();
        for (const name of ["Purchase requests", "Energy", "Reports", "Audit trail", "Settings"]) {
          expect(await sidebarLink(page, name).count()).toBe(1);
        }
        await page.getByRole("button", { name: /Ana Reyes|Dante Cruz/ }).click();
        expect(await page.getByRole("menuitem", { name: "Settings" }).count()).toBe(1);
        await page.keyboard.press("Escape");
        await shot(page, `50-sidebar-${email.split("@")[0]}`);
      });
    }
  });

  it("a Department User voids a booking from the list, with a reason, and its history shows who they are", async () => {
    const purpose = "Assembly to be voided (test data)";
    await bookPortalReservation(purpose);
    await session("void-reservation", async (page) => {
      await signIn(page, "clerk@alaminos.gov.ph");
      await page.goto(`${APP_URL}/reservations`);
      await page.getByText(purpose).first().waitFor({ timeout: 30_000 });
      await page.getByRole("checkbox", { name: "Select row" }).first().check();
      expect(await page.getByRole("button", { name: "Delete" }).count()).toBe(0);
      await page.getByRole("button", { name: "Void" }).click();
      const dialog = page.getByRole("dialog", { name: /^Void 1 reservation/ });
      await dialog.getByRole("button", { name: "Void" }).click();
      await dialog.getByText(/Give a reason/).waitFor();
      await dialog.getByLabel("Reason").fill("Assembly moved to the covered court");
      await shot(page, "51-void-reservation-dialog");
      await dialog.getByRole("button", { name: "Void" }).click();
      await page.getByText(/Voided 1 reservation/).waitFor({ timeout: 30_000 });

      // The booking stays on record, Cancelled, with the reason in its timeline.
      await page.getByText(purpose).first().click();
      const drawer = page.getByRole("dialog");
      await drawer.getByText("Cancelled").first().waitFor({ timeout: 30_000 });
      await drawer.getByText(/Assembly moved to the covered court/).first().waitFor();
      // Closed for editing once voided.
      expect(await drawer.getByRole("button", { name: "Edit", exact: true }).count()).toBe(0);
      // History has only Approval steps and Changes (30 Oct 2026).
      expect(await drawer.getByRole("tab", { name: /Comments|Attachments|Timeline/ }).count()).toBe(0);
      await drawer.locator("summary", { hasText: "History" }).click();
      await drawer.getByRole("tab", { name: "Approval steps" }).waitFor();
      expect(await drawer.getByRole("tab", { name: "Changes" }).count()).toBe(1);
      // The void is a step under the clerk's own name: Dante Cruz → "DC", not a hard-coded "AD".
      const voidedBy = drawer.getByTitle("Dante Cruz").first();
      await voidedBy.waitFor();
      expect(await voidedBy.textContent()).toBe("DC");
      await shot(page, "52-reservation-voided");
    });
  });

  it("the utility and violation screens read their records from Firestore", async () => {
    const at = "2026-10-19T00:00:00.000Z";
    await seedDoc("energy_accounts/ea-e2e", {
      id: "ea-e2e", account_number: "TEST-E-001", account_name: "Test energy account", location: "Municipal Hall",
      meter_number: "EM-1", created_at: at, updated_at: at,
    });
    await seedDoc("water_accounts/wa-e2e", {
      id: "wa-e2e", account_number: "TEST-W-001", account_name: "Test water account", location: "Public Market",
      meter_number: "WM-1", created_at: at, updated_at: at,
    });
    await seedDoc("fuel_vehicles/fv-e2e", {
      id: "fv-e2e", vehicle_name: "Test service pickup", plate_number: "TST 4321", vehicle_type: "Pickup",
      office_code: "GSO", fuel_type: "Diesel", tank_capacity: 70, km_per_liter: 10, current_fuel_balance: 20,
      status: "Active", created_at: at, updated_at: at,
    });
    await seedDoc("violators/vlt-e2e", {
      id: "vlt-e2e", full_name: "Tester, Juan", name_key: "tester juan", created_at: at, updated_at: at,
    });
    await seedDoc("violations/VT-2026-000001", {
      id: "VT-2026-000001", violation_no: "VT-2026-000001", violator_id: "vlt-e2e", violation_type: "Illegal parking",
      date_issued: "2026-10-15", amount: 500, amount_paid: 0, outstanding_balance: 500, payment_status: "Pending",
      created_at: at, updated_at: at,
    });
    await session("utility-screens", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      for (const [path, record, name] of [
        ["/energy", "TEST-E-001", "energy"],
        ["/water", "TEST-W-001", "water"],
        ["/fuel", "TST 4321", "fuel"],
        ["/violations", "Tester, Juan", "violations"],
      ] as const) {
        await page.goto(`${APP_URL}${path}`);
        await page.getByText(record).first().waitFor({ timeout: 30_000 });
        expect(await page.getByText(/Database error|Unable to load|permission/i).count()).toBe(0);
        await shot(page, `53-${name}`);
      }
    });
  });
});
