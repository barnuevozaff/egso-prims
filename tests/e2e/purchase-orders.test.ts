import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  APP_URL,
  PASSWORD,
  SHOTS,
  createAccount,
  filePortalRequest,
  launch,
  newPage,
  resetEmulators,
  seedDoc,
  seedSignatories,
  shot,
  signIn,
} from "./browser";

/**
 * Purchase orders since 21 Oct 2026: approving a request creates its order;
 * "Go to PO" opens it; its details are optional and completed later; the
 * official form prints blanks as lines and runs over as many pages as the
 * items need, never wider than the paper. Synthetic data only.
 */

const FUNCTIONS = "http://127.0.0.1:5001/demo-egso-prims/asia-southeast1";
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
  await seedSignatories();
  for (const [key, value] of [
    ["po_approving_name", "TEST MAYOR"],
    ["po_bac_secretary_name", "TEST BAC SECRETARY"],
  ]) {
    const id = `cfg-po-signatories-${key.replace(/_/g, "-")}`;
    await seedDoc(`system_configuration/${id}`, { id, category: "PO Signatories", key, value });
  }
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

/** Calls a function as the Administrator, the way the app does. */
async function asAdmin<T>(fn: string, data: unknown): Promise<T> {
  const auth = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@alaminos.gov.ph", password: PASSWORD, returnSecureToken: true }),
    },
  );
  const { idToken } = (await auth.json()) as { idToken: string };
  const res = await fetch(`${FUNCTIONS}/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
}

async function listOrders(): Promise<string[]> {
  const res = await fetch(
    "http://127.0.0.1:8085/v1/projects/demo-egso-prims/databases/(default)/documents/purchase_orders?pageSize=100",
    { headers: { Authorization: "Bearer owner" } },
  );
  const body = (await res.json()) as { documents?: { name: string }[] };
  return (body.documents ?? []).map((d) => d.name.split("/").pop()!);
}

interface PdfPage {
  text: string;
  width: number;
  /** The right edge of the furthest text on the page. */
  rightmost: number;
}

async function pagesOf(file: string): Promise<PdfPage[]> {
  const pdfjs = await import(pathToFileURL(path.resolve(__dirname, "../../node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise;
  const pages: PdfPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as { str?: string; transform?: number[]; width?: number }[];
    pages.push({
      text: items.map((it) => it.str ?? "").join(" "),
      width: page.view[2],
      rightmost: Math.max(0, ...items.filter((it) => it.str?.trim()).map((it) => (it.transform?.[4] ?? 0) + (it.width ?? 0))),
    });
  }
  return pages;
}

const peso = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const stubPrint = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __prints: number };
    w.__prints = 0;
    window.print = () => {
      w.__prints += 1;
    };
  });

describe("purchase orders, created with the request's approval (21 Oct 2026)", () => {
  it("approve once → Go to PO → complete details → correct with a reason → print with blanks as lines", async () => {
    const { id: prId } = await filePortalRequest("Office supplies for the fourth quarter (test data)", [
      { description: "Bond paper, A4", quantity: 10, unit: "ream", estimatedCost: 250 },
      { description: "Ballpen, black", quantity: 3, unit: "box", estimatedCost: 120 },
    ]);

    await session("po-auto", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/purchase-requests`);
      await page.getByText("Office supplies for the fourth quarter (test data)").first().click();
      const drawer = page.getByRole("dialog");
      expect(await drawer.getByRole("button", { name: /Generate PO/ }).count()).toBe(0);
      await drawer.getByRole("button", { name: "Approve", exact: true }).click();
      await page.getByRole("dialog", { name: "Advance to Approved?" }).getByRole("button", { name: "Approve" }).click();
      await page.getByText(/purchase order PO-\d{4}-000001 created/).waitFor({ timeout: 30_000 });
      await drawer.getByRole("button", { name: "Go to PO" }).click();

      await page.waitForURL(/\/purchase-orders\/PO-\d{4}-000001$/);
      const poNumber = page.url().split("/").pop()!;
      await page.getByRole("heading", { name: poNumber }).waitFor();
      // The page says so; the hidden print sheet says it too.
      await page.getByText(/Authorized by the approval of 100-\d{4}-000001/).first().waitFor();
      // No second approval, release or completion for this order.
      for (const gone of ["Approve", "Submit for approval", "Mark Completed", "Issue PO", "Return to draft"]) {
        expect(await page.getByRole("button", { name: gone, exact: true }).count()).toBe(0);
      }
      // Every document detail starts blank, and none is marked required.
      expect(await page.getByLabel("Supplier", { exact: true }).inputValue()).toBe("");
      expect(await page.locator("form label span.text-red-600").count()).toBe(0);
      await shot(page, "70-po-page-blank");

      // Printed with everything blank: lines to write on, nothing invented.
      await page.emulateMedia({ media: "print" });
      const blankFile = path.join(SHOTS, "71-po-blank-fields.pdf");
      await page.pdf({ path: blankFile, format: "A4", printBackground: true });
      await page.emulateMedia({ media: "screen" });
      const blank = await pagesOf(blankFile);
      expect(blank).toHaveLength(1);
      const text = blank[0].text;
      for (const expected of ["PURCHASE ORDER", poNumber, "Supplier :", "Address :", "TIN :", "Contact Number:", "Place of Delivery :", "Payment Term :", "TEST MAYOR", peso(2860)]) {
        expect(text, expected).toContain(expected);
      }
      for (const never of ["undefined", "null", "N/A", "Not specified", "Not set", "—"]) expect(text).not.toContain(never);

      // Completing blanks needs no reason.
      await page.getByLabel("Supplier", { exact: true }).fill("Test Supplies Co. (test data)");
      await page.getByLabel("Payment term").fill("Cash");
      await page.getByLabel("Item 1 stock or property number").fill("SP-001");
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.getByText(`${poNumber} saved`).waitFor({ timeout: 30_000 });

      // Changing what is recorded is a correction: a reason first.
      await page.getByLabel("Item 1 quantity").fill("12");
      await page.getByLabel("Supplier", { exact: true }).fill("Other Supplies Co. (test data)");
      await page.getByRole("button", { name: "Save correction" }).click();
      await page.getByText("Give the reason for this correction.").first().waitFor();
      await page.getByLabel(/^Reason for the correction/).fill("Award changed after canvass (test data)");
      await shot(page, "72-po-correction");
      await page.getByRole("button", { name: "Save correction" }).click();
      await page.getByText(`${poNumber} corrected`).waitFor({ timeout: 30_000 });
      await page.getByText(/Corrected by Ana Reyes \(Award changed after canvass \(test data\)\)/).first().waitFor();

      // Refreshing, or approving again, never makes another order.
      await page.reload();
      await page.getByRole("heading", { name: poNumber }).waitFor({ timeout: 30_000 });
      await asAdmin("approvePurchaseRequest", { id: prId });
      expect(await listOrders()).toEqual([poNumber]);

      await stubPrint(page);
      await page.getByRole("button", { name: "Print PO" }).click();
      await page.waitForFunction(() => (window as unknown as { __prints: number }).__prints === 1);
      await page.emulateMedia({ media: "print" });
      const fullFile = path.join(SHOTS, "73-po-completed.pdf");
      await page.pdf({ path: fullFile, format: "A4", printBackground: true });
      const full = (await pagesOf(fullFile))[0].text;
      for (const expected of ["Other Supplies Co. (test data)", "SP-001", "Cash", peso(12 * 250 + 3 * 120)]) {
        expect(full, expected).toContain(expected);
      }
    });
  });

  it("Settings edit only the officials' names; each form keeps its own fixed signature block (21 Oct 2026)", async () => {
    await session("signatory-settings", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/settings`);
      const names = page.getByLabel(/: printed name$/);
      await names.first().waitFor({ timeout: 30_000 });
      expect(await names.count()).toBe(5);
      for (const label of [
        "Requested by, General Services Officer: printed name",
        "Cash Availability, Municipal Treasurer: printed name",
        "Approved by, Municipal Mayor: printed name",
        "Very truly yours, Municipal Mayor: printed name",
        "Certified Correct, BAC Secretary: printed name",
      ]) {
        expect(await page.getByLabel(label).count(), label).toBe(1);
      }
      // No designations, office mappings or added roles to edit.
      expect(await page.getByLabel(/Designation/).count()).toBe(0);
      expect(await page.getByText(/OFFICE CODE \|/).count()).toBe(0);
      await page.getByLabel("Certified Correct, BAC Secretary: printed name").scrollIntoViewIfNeeded();
      await shot(page, "76-settings-signatories");

      // A new BAC Secretary is saved and stays saved.
      await page.getByLabel("Certified Correct, BAC Secretary: printed name").fill("NEW BAC SECRETARY (test data)");
      await page.getByRole("button", { name: "Save Changes", disabled: false }).click();
      await page.getByText(/settings saved/).waitFor({ timeout: 30_000 });
      await page.reload();
      await page.getByLabel(/: printed name$/).first().waitFor({ timeout: 30_000 });
      expect(await page.getByLabel("Certified Correct, BAC Secretary: printed name").inputValue()).toBe("NEW BAC SECRETARY (test data)");
    });

    // The next order carries the new name in its own block; the request keeps the PR block.
    const { id } = await filePortalRequest("Signatory check (test data)", [
      { description: "Bond paper, A4", quantity: 1, unit: "ream", estimatedCost: 250 },
    ]);
    const approved = await asAdmin<{ po_number: string }>("approvePurchaseRequest", { id });
    await session("signatory-prints", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/purchase-orders/${approved.po_number}`);
      await page.getByRole("heading", { name: approved.po_number }).waitFor({ timeout: 30_000 });
      await page.emulateMedia({ media: "print" });
      const poFile = path.join(SHOTS, "77-po-signatories.pdf");
      await page.pdf({ path: poFile, format: "A4", printBackground: true });
      const po = (await pagesOf(poFile)).map((p) => p.text).join(" ");
      for (const expected of ["Conforme:", "Very truly yours,", "TEST MAYOR", "Municipal Mayor", "Certified Correct:", "NEW BAC SECRETARY (test data)", "BAC Secretary", "Signature over Printed Name of Supplier"]) {
        expect(po, expected).toContain(expected);
      }
      for (const prOnly of ["Requested by:", "Cash Availability:", "Approved by:"]) expect(po).not.toContain(prOnly);

      await page.emulateMedia({ media: "screen" });
      await page.goto(`${APP_URL}/purchase-requests`);
      await page.getByText("Signatory check (test data)").first().click();
      await page.getByRole("dialog").getByRole("button", { name: "Print" }).waitFor();
      await page.emulateMedia({ media: "print" });
      const prFile = path.join(SHOTS, "78-pr-signatories.pdf");
      await page.pdf({ path: prFile, format: "A4", printBackground: true });
      const pr = (await pagesOf(prFile)).map((p) => p.text).join(" ");
      for (const expected of ["Requested by:", "Cash Availability:", "Approved by:", "TEST GSO SIGNATORY", "General Services Officer", "TEST TREASURER", "Municipal Treasurer", "TEST MAYOR", "Municipal Mayor"]) {
        expect(pr, expected).toContain(expected);
      }
      for (const poOnly of ["Conforme", "Very truly yours", "NEW BAC SECRETARY"]) expect(pr).not.toContain(poOnly);
    });
  });

  it("prints 1, 10, 30 and 50-line orders in one job: all lines, in order, within the paper's width", async () => {
    const sizes = [1, 10, 30, 50];
    const orders: { tag: string; n: number; po: string; total: number }[] = [];
    for (const n of sizes) {
      const tag = `P${n}`;
      const items = Array.from({ length: n }, (_, i) => ({
        description:
          `${tag}-${String(i + 1).padStart(2, "0")} ` +
          (i % 9 === 4
            ? 'heavy duty wheelbarrow / buggy, 80 liters capacity, GA 16 with 2-13" solid tires, powder coated tray, replaceable handle grips, for construction and maintenance crews (test data)'
            : "supply item, 500 ml (test data)"),
        quantity: (i % 7) + 2,
        unit: ["bottle", "pc", "box", "ream"][i % 4],
        estimatedCost: 50 + i * 15,
      }));
      const { id } = await filePortalRequest(`Print check ${tag} (test data)`, items);
      const approved = await asAdmin<{ po_number: string }>("approvePurchaseRequest", { id });
      orders.push({ tag, n, po: approved.po_number, total: items.reduce((s, it) => s + it.quantity * it.estimatedCost, 0) });
    }
    // One order fully completed with long values, to show they wrap inside the form.
    await asAdmin("updatePurchaseOrderDetails", {
      id: orders[1].po,
      details: {
        supplierName: "Southern Luzon Integrated Office, School and Janitorial Supplies Trading Corporation (test data)",
        supplierAddress: "Unit 1203, 12th Floor, Sample Commercial Building, 1234 National Highway, Barangay Sample, Alaminos, Laguna 4001",
        supplierTin: "000-000-000-00000",
        supplierContact: "0917 000 0000 / (049) 000 0000",
        modeOfProcurement: "Small Value Procurement (Section 53.9) — test data",
        deliveryAddress: "General Services Office Stockroom, Ground Floor, Municipal Hall (test data)",
        expectedDelivery: "2026-11-30",
        deliveryTerm: "Within seven (7) working days from receipt of this order (test data)",
        paymentTerm: "Cash upon complete delivery (test data)",
        bacResolutionNo: "2026-123",
        bacResolutionSeries: "2026",
      },
    });

    await session("po-print-list", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/purchase-orders`);
      await page.getByText("Print check P50 (test data)", { exact: false }).first().waitFor({ timeout: 30_000 });
      await shot(page, "74-po-list");
      await stubPrint(page);
      await page.getByRole("checkbox", { name: "Select all rows" }).check();
      await page.getByRole("button", { name: "Print 4" }).click();
      await page.waitForFunction(() => (window as unknown as { __prints: number }).__prints === 1);
      await page.emulateMedia({ media: "print" });
      const file = path.join(SHOTS, "75-four-purchase-orders.pdf");
      await page.pdf({ path: file, format: "A4", printBackground: true });
      const pages = await pagesOf(file);

      for (const p of pages) {
        expect(p.text.trim().length, "no blank pages").toBeGreaterThan(0);
        // Nothing past the right margin: A4 is 595pt wide, the margin 14 mm ≈ 40pt.
        expect(p.rightmost, "within the width").toBeLessThanOrEqual(p.width - 30);
        for (const ui of ["Purchase orders", "Search PO", "Inventory", "selected"]) expect(p.text).not.toContain(ui);
      }
      const starts = pages.flatMap((p, i) => (p.text.includes("PURCHASE ORDER") ? [i] : []));
      expect(starts).toHaveLength(4);
      [...orders].reverse().forEach((o, d) => {
        const docPages = pages.slice(starts[d], starts[d + 1] ?? pages.length);
        const text = docPages.map((p) => p.text).join(" ");
        let at = -1;
        for (let k = 1; k <= o.n; k++) {
          const marker = `${o.tag}-${String(k).padStart(2, "0")} `;
          const found = text.indexOf(marker);
          expect(found, `${marker} in order`).toBeGreaterThan(at);
          expect(text.indexOf(marker, found + 1), `${marker} once`).toBe(-1);
          at = found;
        }
        expect(text).toContain(o.po);
        expect(text).toContain(peso(o.total));
        expect(text.indexOf("Very truly yours,")).toBeGreaterThan(at);
        if (o.n >= 30) {
          expect(docPages.length, `${o.tag} runs onto more pages`).toBeGreaterThan(1);
          for (const p of docPages) if (p.text.includes(`${o.tag}-`)) expect(p.text).toContain("Description");
        }
      });
      expect(pages.map((p) => p.text).join(" ")).toContain("Southern Luzon Integrated Office");
    });
  });
});
