import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { APP_URL, createStaff, launch, newPage, resetEmulators, shot, signIn } from "./browser";

/**
 * The approved record policies (2026-10-20) in the browser, on Firebase: a
 * finalized bill is corrected with a reason and keeps its previous values,
 * is voided instead of deleted, and a Records form is voided from its page.
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

const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date());

describe("record policies in the browser, on Firebase", () => {
  it("a bill is corrected with a reason, keeps its history, and is voided instead of deleted", async () => {
    const at = "2026-10-01T00:00:00.000Z";
    await seedDoc("energy_accounts/ea-pol", {
      id: "ea-pol", account_number: "TEST-POL-001", account_name: "Policy test account", location: "Municipal Hall",
      meter_number: "M-POL", created_at: at, updated_at: at,
    });
    await seedDoc("unique_keys/energy_accounts.account_number:TEST-POL-001", { collection: "energy_accounts", doc_id: "ea-pol" });

    await session("bill-policy", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/energy`);
      await page.getByText("TEST-POL-001").first().click({ timeout: 30_000 });
      const drawer = page.getByRole("dialog");
      await drawer.getByRole("button", { name: "Record Bill" }).first().click();

      const form = page.getByRole("dialog").last();
      await form.getByLabel("Amount (PHP)").fill("12000");
      await form.getByLabel("Number of KW").fill("800");
      await form.getByRole("button", { name: "Record Bill" }).click();
      await page.getByText(/bill recorded/).waitFor({ timeout: 30_000 });
      // Saving closes the account's drawer; open it again.
      await page.getByText("TEST-POL-001").first().click();

      // Correct: refused without a reason, saved with one.
      await page.getByRole("button", { name: `Correct the ${monthYear} bill` }).click();
      const correct = page.getByRole("dialog").last();
      await correct.getByText("Correct Billing Record").waitFor();
      await correct.getByLabel("Amount (PHP)").fill("12500");
      await correct.getByRole("button", { name: "Save Correction" }).click();
      await correct.getByText("Give the reason for this correction.").waitFor();
      await correct.getByLabel("Reason for correction").fill("Utility reissued the statement");
      await shot(page, "70-bill-correction");
      await correct.getByRole("button", { name: "Save Correction" }).click();
      await page.getByText(/Bill corrected/).waitFor({ timeout: 30_000 });
      await page.getByText("TEST-POL-001").first().click();

      // History shows before and after, the reason and who.
      await page.getByRole("button", { name: `History of the ${monthYear} bill` }).click();
      const history = page.getByRole("dialog").last();
      await history.getByText("Corrected by admin@alaminos.gov.ph").waitFor();
      await history.getByText("Reason: Utility reissued the statement").waitFor();
      await shot(page, "71-bill-history");
      await page.keyboard.press("Escape");

      // Void, not delete.
      expect(await page.getByRole("button", { name: /^Delete .* bill$/ }).count()).toBe(0);
      await page.getByRole("button", { name: `Void the ${monthYear} bill` }).click();
      const voidDialog = page.getByRole("dialog", { name: `Void the ${monthYear} bill?` });
      await voidDialog.getByLabel("Reason").fill("Recorded against the wrong account");
      await voidDialog.getByRole("button", { name: "Void" }).click();
      // The row itself (not the toast) says Voided, and offers only its history.
      const row = page.getByRole("dialog").getByRole("row", { name: /October|EC-/ }).filter({ hasText: "Voided" });
      await row.waitFor({ timeout: 30_000 });
      expect(await row.getByRole("button", { name: `History of the ${monthYear} bill` }).count()).toBe(1);
      expect(await row.getByRole("button", { name: `Correct the ${monthYear} bill` }).count()).toBe(0);
      expect(await row.getByRole("button", { name: `Void the ${monthYear} bill` }).count()).toBe(0);
      await shot(page, "72-bill-voided");
    });
  });

  it("a Records form is voided from its page and keeps its number", async () => {
    const at = "2026-10-19T00:00:00.000Z";
    await seedDoc("disposition_schedules/rds-pol", {
      id: "rds-pol", schedule_no: "RDS-2026-000031", agency_name: "Test Agency (policy)", agency_address: "Test address",
      date_prepared: "2026-10-19", status: "Draft", created_at: at, updated_at: at,
    });
    await seedDoc("record_series/ser-pol", {
      id: "ser-pol", schedule_id: "rds-pol", item_number: 1, title_and_description: "Vouchers (test)",
      retention_active: 1, retention_storage: 1, retention_total: 2, created_at: at, updated_at: at,
    });
    await session("records-void", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/records/rds-pol`);
      await page.getByText("Vouchers (test)").first().waitFor({ timeout: 30_000 });
      expect(await page.getByRole("button", { name: "Delete", exact: true }).count()).toBe(0);
      await page.getByRole("button", { name: "Void", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Void RDS-2026-000031?" });
      await dialog.getByLabel("Reason").fill("Superseded by a corrected schedule");
      await dialog.getByRole("button", { name: "Void" }).click();
      await page.getByText(/Voided on .* by admin@alaminos.gov.ph/).waitFor({ timeout: 30_000 });
      await page.getByText("RDS-2026-000031").first().waitFor();
      for (const name of ["Edit", "Void"]) {
        expect(await page.getByRole("button", { name, exact: true }).count()).toBe(0);
      }
      await shot(page, "73-records-voided");
    });
  });
});

describe("final hardening in the browser, on Firebase (approved 2026-10-21)", () => {
  const at = "2026-10-01T00:00:00.000Z";

  it("an account that holds a bill is kept when deleted, and archived from its drawer", async () => {
    await seedDoc("energy_accounts/ea-arc", {
      id: "ea-arc", account_number: "TEST-ARC-001", account_name: "Archive test account", location: "Municipal Hall",
      meter_number: "M-ARC", created_at: at, updated_at: at,
    });
    await seedDoc("unique_keys/energy_accounts.account_number:TEST-ARC-001", { collection: "energy_accounts", doc_id: "ea-arc" });
    await seedDoc("energy_bills/eb-arc", {
      id: "eb-arc", account_id: "ea-arc", doc_number: "EC-2026-000001", billing_month: 9, billing_year: 2026,
      amount: 1000, kwh: 50, remarks: null, created_at: at, updated_at: at,
    });

    await session("holder-archive", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/energy`);
      const row = page.getByRole("row", { name: /TEST-ARC-001/ });
      await row.getByLabel("Select row").click({ timeout: 30_000 });
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      const confirm = page.getByRole("dialog", { name: "Delete 1 account?" });
      await confirm.getByText(/An account that holds bills is kept/).waitFor();
      await confirm.getByRole("button", { name: "Delete", exact: true }).click();
      await page.getByText(/TEST-ARC-001: This account holds official records, which are never deleted\. Archive it instead\./).waitFor({
        timeout: 30_000,
      });
      await shot(page, "74-holder-kept");
      await row.waitFor();

      await page.getByText("TEST-ARC-001").first().click();
      await page.getByRole("dialog").getByRole("button", { name: "Archive Account" }).click();
      await page.getByText("Account archived — its bills and history are kept").waitFor({ timeout: 30_000 });
      await page.keyboard.press("Escape");

      // The register lists active accounts; the archived one is a filter away.
      await row.waitFor({ state: "detached", timeout: 30_000 });
      await page.getByRole("combobox").filter({ hasText: "Active accounts" }).click();
      await page.getByRole("option", { name: "Archived accounts" }).click();
      await row.waitFor({ timeout: 30_000 });
      await shot(page, "78-archived-filter");

      await page.getByText("TEST-ARC-001").first().click();
      const drawer = page.getByRole("dialog");
      await drawer.getByRole("button", { name: "Restore Account" }).waitFor({ timeout: 30_000 });
      await drawer.getByText("Archived", { exact: true }).waitFor();
      // No new bills or submeters until it is restored (2026-10-21).
      await drawer.getByText("Restore it to record new bills or submeters.").waitFor();
      expect(await drawer.getByRole("button", { name: /Record Bill|Add Submeter/ }).count()).toBe(0);
      await shot(page, "75-account-archived");
    });
  });

  it("a ticket is cancelled with a reason, shows who and when, and cannot be deleted", async () => {
    await seedDoc("violators/vr-pol", {
      id: "vr-pol", full_name: "Tester, Lito", name_key: "tester lito", created_at: at, updated_at: at,
    });
    await seedDoc("violations/vl-pol", {
      id: "vl-pol", violator_id: "vr-pol", violation_no: "OV-2026-000001", violation_type: "Illegal parking",
      date_issued: "2026-10-15", amount: 500, amount_paid: 0, outstanding_balance: 500, payment_status: "Pending",
      created_at: at, updated_at: at,
    });

    await session("ticket-cancel", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/violations`);
      await page.getByText("Tester, Lito").first().click({ timeout: 30_000 });
      const drawer = page.getByRole("dialog");
      await drawer.getByText("OV-2026-000001").waitFor();
      expect(await drawer.getByRole("button", { name: /^Delete violation/ }).count()).toBe(0);
      await drawer.getByRole("button", { name: "Cancel", exact: true }).click();

      const dialog = page.getByRole("dialog", { name: "Cancel OV-2026-000001?" });
      await dialog.getByRole("button", { name: "Cancel Violation" }).click();
      await dialog.getByText(/reason/i).first().waitFor();
      await dialog.getByLabel("Reason").fill("Issued to the wrong vehicle");
      await dialog.getByRole("button", { name: "Cancel Violation" }).click();
      await page.getByText("Violation cancelled").waitFor({ timeout: 30_000 });

      // The drawer may close on save; open the profile again to read the row.
      if (!(await page.getByText(/Issued to the wrong vehicle — admin@alaminos\.gov\.ph/).isVisible())) {
        await page.getByText("Tester, Lito").first().click();
      }
      await page.getByText(/Issued to the wrong vehicle — admin@alaminos\.gov\.ph/).waitFor({ timeout: 30_000 });
      await shot(page, "76-ticket-cancelled");

      // An archived profile takes no new tickets until it is restored.
      const profile = page.getByRole("dialog");
      await profile.getByRole("button", { name: "Archive Profile" }).click();
      await profile.getByText("Restore it to record new violations.").waitFor({ timeout: 30_000 });
      expect(await profile.getByRole("button", { name: "Add Violation" }).count()).toBe(0);
      await profile.getByRole("button", { name: "Restore Profile" }).waitFor();
    });
  });

  it("a meter reading is corrected with a reason, and its history shows before and after", async () => {
    await seedDoc("water_accounts/wa-pol", {
      id: "wa-pol", account_number: "TEST-WTR-001", account_name: "Water test account", location: "Municipal Hall",
      meter_number: "W-POL", created_at: at, updated_at: at,
    });
    await seedDoc("unique_keys/water_accounts.account_number:TEST-WTR-001", { collection: "water_accounts", doc_id: "wa-pol" });
    await seedDoc("water_submeters/ws-pol", {
      id: "ws-pol", account_id: "wa-pol", submeter_name: "Comfort room (test)", submeter_number: "WS-POL",
      assigned_office: "GSO", status: "Active", created_at: at, updated_at: at,
    });
    await seedDoc("water_meter_readings/wr-pol", {
      id: "wr-pol", submeter_id: "ws-pol", reading_date: "2026-10-01", previous_reading: 100, current_reading: 130,
      consumption: 30, amount: 600, remarks: null, created_at: at, updated_at: at,
    });

    await session("reading-correction", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      const openSubmeter = async () => {
        await page.goto(`${APP_URL}/water`);
        await page.getByText("TEST-WTR-001").first().click({ timeout: 30_000 });
        await page.getByRole("dialog").getByText("Comfort room (test)").first().click();
      };
      await openSubmeter();
      await page.getByRole("button", { name: "Correct the reading of 1 Oct 2026" }).click({ timeout: 30_000 });

      const form = page.getByRole("dialog").last();
      await form.getByText("Correct Meter Reading").waitFor();
      await form.getByLabel("Current Reading").fill("125");
      await form.getByRole("button", { name: "Save Correction" }).click();
      await form.getByText("Give the reason for this correction.").waitFor();
      await form.getByLabel("Reason for correction").fill("Meter re-read on site");
      await form.getByRole("button", { name: "Save Correction" }).click();
      await page.getByText("Reading corrected — the previous values are kept in its history").waitFor({ timeout: 30_000 });

      await openSubmeter();
      await page.getByRole("button", { name: "History of the reading of 1 Oct 2026" }).click({ timeout: 30_000 });
      const history = page.getByRole("dialog").last();
      await history.getByText("Corrected by admin@alaminos.gov.ph").waitFor();
      await history.getByText("Reason: Meter re-read on site").waitFor();
      await shot(page, "77-reading-history");
      await page.keyboard.press("Escape");

      // Voided, not deleted: the row stays, marked, and leaves the totals.
      const submeter = page.getByRole("dialog");
      expect(await submeter.getByRole("button", { name: /^Delete reading/ }).count()).toBe(0);
      await submeter.getByRole("button", { name: "Void the reading of 1 Oct 2026" }).click();
      const voiding = page.getByRole("dialog", { name: "Void the reading of 1 Oct 2026?" });
      await voiding.getByLabel("Reason").fill("Read from the wrong meter");
      await voiding.getByRole("button", { name: "Void" }).click();
      const voidedRow = submeter.getByRole("row", { name: /1 Oct 2026/ }).filter({ hasText: "Voided" });
      await voidedRow.waitFor({ timeout: 30_000 });
      expect(await voidedRow.getByRole("button", { name: /Correct|Void/ }).count()).toBe(0);
      await submeter.getByText("0 readings · 1 voided").waitFor();
      await shot(page, "79-reading-voided");
    });
  });
});
