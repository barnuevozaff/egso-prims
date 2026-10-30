import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  APP_URL,
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
  await createAccount("head@alaminos.gov.ph", "Alma Dizon");
  await seedSignatories();
});

/** Runs a browser session, keeping a screenshot if it fails. */
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

async function openRequest(page: Page, purpose: string) {
  await page.goto(`${APP_URL}/purchase-requests`);
  await page.getByText(purpose).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Print" }).waitFor();
}

const drawerButton = (page: Page, name: string) => page.getByRole("dialog").getByRole("button", { name, exact: true });

describe("purchase requests in the browser, on Firebase", () => {
  it("the public portal files a request and tracks it by number", async () => {
    await session("portal", async (page) => {
      await page.goto(`${APP_URL}/portal/request`);
      await page.locator("#pr-office").click();
      await page.getByPlaceholder("Search offices…").fill("General Services");
      await page.getByRole("option", { name: "General Services Office", exact: true }).click();
      await page.getByLabel("Requested by").fill("Juan Dela Cruz");
      // Section and FPP are optional; the purpose is required (restored 21 Oct 2026).
      await page.getByLabel("Section").fill("Supply");
      await page.getByLabel("Item 1 description").fill("Bond paper, A4");
      await page.getByLabel("Item 1 quantity").fill("10");
      await page.getByLabel("Item 1 unit cost in pesos").fill("250");
      // Spaces alone do not count, and nothing is filed.
      await page.locator("#pr-purpose").fill("   ");
      await page.getByRole("button", { name: "Submit Purchase Request" }).click();
      await page.getByText("Enter the purpose of this request").first().waitFor();
      expect(await page.getByText(/PR-\d{4}-\d{6}/).count()).toBe(0);
      await shot(page, "09-portal-purpose-required");
      await page.locator("#pr-purpose").fill("Bond paper for Q4 reports (test data)");
      await page.getByRole("button", { name: "Submit Purchase Request" }).click();
      const number = await page.getByText(/PR-\d{4}-000001/).first().textContent({ timeout: 30_000 });
      const reference = /PR-\d{4}-000001/.exec(number ?? "")?.[0];
      expect(reference).toBeTruthy();
      await shot(page, "10-portal-receipt");

      await page.goto(`${APP_URL}/portal/track`);
      await page.getByLabel("Reference number").fill(reference!);
      await page.getByRole("button", { name: "Track" }).click();
      await page.getByText("Bond paper for Q4 reports (test data)").first().waitFor({ timeout: 30_000 });
      await shot(page, "11-portal-track");
    });
  });

  it("any account approves or returns a portal request from the drawer", async () => {
    const purpose = "Clinic supplies (test data)";
    await filePortalRequest(purpose);

    await session("approver", async (page) => {
      await signIn(page, "head@alaminos.gov.ph");
      await openRequest(page, purpose);
      expect(await drawerButton(page, "Return").count()).toBe(1);
      await drawerButton(page, "Approve").click();
      await page.getByRole("dialog", { name: "Advance to Approved?" }).getByRole("button", { name: "Approve" }).click();
      await drawerButton(page, "Go to PO").waitFor({ timeout: 30_000 });
      expect(await drawerButton(page, "Mark Completed").count()).toBe(0);
      await shot(page, "21-drawer-approved");
    });
  });

  it("the GSO completes a public request, approves it under an official number, and prints it (21 Oct 2026)", async () => {
    let reference = "";
    await session("portal-minimal", async (page) => {
      await page.goto(`${APP_URL}/portal/request`);
      await page.locator("#pr-office").click();
      await page.getByPlaceholder("Search offices…").fill("General Services");
      await page.getByRole("option", { name: "General Services Office", exact: true }).click();
      await page.getByLabel("Requested by").fill("Juan Dela Cruz");
      const description = page.getByLabel("Item 1 description");
      await description.fill("bond paper a4, 70gsm (test data)");
      await page.getByLabel("Item 1 quantity").click();
      // Capital first letter on leaving the field; the rest exactly as typed.
      expect(await description.inputValue()).toBe("Bond paper a4, 70gsm (test data)");
      await page.getByLabel("Item 1 quantity").fill("10");
      await page.getByLabel("Item 1 unit cost in pesos").fill("250");
      await page.locator("#pr-purpose").fill("Office supplies for the fourth quarter (test data)");
      await page.getByRole("button", { name: "Submit Purchase Request" }).click();
      reference = /PR-\d{4}-\d{6}/.exec((await page.getByText(/PR-\d{4}-\d{6}/).first().textContent({ timeout: 30_000 })) ?? "")?.[0] ?? "";
      expect(reference).toBeTruthy();
    });

    await session("gso-complete-approve", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await openRequest(page, "Office supplies for the fourth quarter (test data)");
      // The fund is optional (22 Oct 2026); the GSO completes it here anyway.
      await drawerButton(page, "Edit").click();
      // The requester's purpose is there, and the GSO may correct it before approval.
      expect(await page.locator("#pr-purpose").inputValue()).toBe("Office supplies for the fourth quarter (test data)");
      await page.locator("#pr-purpose").fill("Office supplies for the fourth quarter of 2026 (test data)");
      await page.locator("#pr-fund").click();
      await page.getByRole("option", { name: "General Fund" }).click();
      // Item group headings were removed from the form (21 Oct 2026).
      expect(await page.getByRole("button", { name: "Add heading" }).count()).toBe(0);
      await shot(page, "22-gso-edit");
      await page.getByRole("button", { name: "Save Changes" }).click();
      await page.getByText(`${reference} updated`).waitFor({ timeout: 30_000 });

      await openRequest(page, "Office supplies for the fourth quarter of 2026 (test data)");
      await drawerButton(page, "Approve").click();
      await page.getByRole("dialog", { name: "Advance to Approved?" }).getByRole("button", { name: "Approve" }).click();
      await drawerButton(page, "Go to PO").waitFor({ timeout: 30_000 });
      const year = new Date().getFullYear();
      await page.getByRole("dialog").getByText(`100-${year}-000001`).first().waitFor({ timeout: 30_000 });
      expect(await page.getByRole("dialog").getByText(reference).count()).toBeGreaterThan(0);
      await shot(page, "23-drawer-official-number");

      await page.emulateMedia({ media: "print" });
      await page.pdf({ path: path.join(SHOTS, "51-official-purchase-request.pdf"), format: "A4", printBackground: true });
    });
  });

  it("the drawer and edit page are compact: no attachments or comments, history folded, errors listed (21 Oct 2026)", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      description: `R${String(i + 1).padStart(2, "0")} ${i % 9 === 4 ? "heavy duty wheelbarrow / buggy, 80 liters capacity, GA 16 with 2-13\" solid tires, powder coated (test data)" : "supply item (test data)"}`,
      quantity: (i % 5) + 1,
      unit: "pc",
      estimatedCost: 100 + i,
    }));
    await filePortalRequest("Compact review check (test data)", items);
    const total = items.reduce((s, it) => s + it.quantity * it.estimatedCost, 0);

    await session("pr-compact", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/purchase-requests`);
      await page.getByText("Compact review check (test data)").first().click();
      const drawer = page.getByRole("dialog");
      await drawer.getByText("Ready for approval: the purpose and the signatories are in.").waitFor({ timeout: 30_000 });
      for (const gone of [/Attachments/, /Comments/]) expect(await drawer.getByRole("tab", { name: gone }).count()).toBe(0);
      // The total is in view without scrolling through fifty lines.
      const totalText = `₱${total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      await drawer.getByText(totalText).first().waitFor();
      expect(await drawer.getByText("R50 heavy duty wheelbarrow", { exact: false }).count()).toBe(1);
      // History is folded away, and opens.
      const history = drawer.locator("summary", { hasText: "History" });
      await history.click();
      await drawer.getByRole("tab", { name: "Approval steps" }).waitFor();
      await shot(page, "15-pr-drawer-compact");

      // Editing: a bad quantity is listed in the summary, and the link goes to it.
      await drawer.getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByLabel("Item 3 quantity").fill("");
      await page.getByRole("button", { name: "Save Changes" }).click();
      const problems = page.getByRole("alert").filter({ hasText: /before saving/ });
      await problems.waitFor();
      await problems.getByRole("button", { name: /^Item 3:/ }).click();
      expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Item 3 quantity");
      await shot(page, "16-pr-edit-problems");
    });
  });

  it("an Administrator voids a request from the list, with a reason, and it stays on record", async () => {
    const purpose = "Duplicate request (test data)";
    const { pr_number } = await filePortalRequest(purpose);

    await session("void", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/purchase-requests`);
      await page.getByText(purpose).first().waitFor();
      expect(await page.getByRole("button", { name: /Export/ }).count()).toBe(0);
      await page.getByRole("checkbox", { name: "Select row" }).first().check();
      expect(await page.getByRole("button", { name: /Export/ }).count()).toBe(0);
      await page.getByRole("button", { name: "Cancel selection" }).click();

      // One request, from its row menu; the drawer stays closed.
      await page.getByRole("button", { name: `Actions for ${pr_number}` }).click();
      await page.getByRole("menuitem", { name: "Void request…" }).click();
      const dialog = page.getByRole("dialog", { name: `Void ${pr_number}?` });
      await dialog.getByRole("button", { name: "Void request" }).click();
      await dialog.getByText(/Give a reason/).waitFor();
      await shot(page, "29-void-dialog");
      await dialog.getByLabel("Reason").fill("Filed twice by the requesting office");
      await dialog.getByRole("button", { name: "Void request" }).click();
      await page.getByText(/Voided 1 purchase request/).waitFor({ timeout: 30_000 });
      await page.getByRole("tab", { name: /Cancelled/ }).click();
      await page.getByText(purpose).first().click();
      // Still on record, with who voided it and why.
      await page.getByRole("dialog").getByText(pr_number).first().waitFor();
      expect(await page.getByRole("dialog").getByText(/Filed twice by the requesting office/).count()).toBeGreaterThan(0);
      await shot(page, "30-list-voided");
    });
  });

  it("on the local demo an Administrator deletes test records, after confirming; linked ones are kept", async () => {
    const a = await filePortalRequest("Demo cleanup A (test data)");
    const b = await filePortalRequest("Demo cleanup B (test data)");
    const c = await filePortalRequest("Demo cleanup C (test data)");
    // A purchase order was raised from C.
    await seedDoc("purchase_orders/PO-2026-000001", {
      id: "PO-2026-000001",
      po_number: "PO-2026-000001",
      pr_number: c.pr_number,
      status: "Draft",
    });

    await session("demo-delete", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/purchase-requests`);
      await page.getByText("Demo cleanup A (test data)").waitFor({ timeout: 30_000 });

      // One record: nothing happens until the box is ticked; Cancel keeps it.
      await page.getByRole("button", { name: `Actions for ${a.pr_number}` }).click();
      await page.getByRole("menuitem", { name: "Delete (demo only)…" }).click();
      const one = page.getByRole("dialog", { name: `Delete ${a.pr_number} from the demo?` });
      const confirmOne = one.getByRole("button", { name: "Delete 1 record" });
      expect(await confirmOne.isDisabled()).toBe(true);
      await shot(page, "31-demo-delete-dialog");
      await one.getByRole("button", { name: "Cancel" }).click();
      await one.waitFor({ state: "hidden" });
      expect(await page.getByText("Demo cleanup A (test data)").count()).toBe(1);

      await page.getByRole("button", { name: `Actions for ${a.pr_number}` }).click();
      await page.getByRole("menuitem", { name: "Delete (demo only)…" }).click();
      await one.getByRole("checkbox").check();
      await confirmOne.click();
      await page.getByText("Deleted 1 demo purchase request").waitFor({ timeout: 30_000 });
      await page.getByText("Demo cleanup A (test data)").waitFor({ state: "detached", timeout: 30_000 });

      // Several: the count is shown, and the linked one is kept with the reason.
      await page.getByRole("checkbox", { name: "Select all rows" }).check();
      await page.getByRole("button", { name: "Delete (demo)" }).click();
      const many = page.getByRole("dialog", { name: "Delete 2 purchase requests from the demo?" });
      await many.getByRole("checkbox").check();
      await many.getByRole("button", { name: "Delete 2 records" }).click();
      await page.getByText("Deleted 1 demo purchase request").first().waitFor({ timeout: 30_000 });
      await page.getByText(`${c.pr_number} is kept: PO-2026-000001 was raised from it.`).waitFor();
      await page.getByText("Demo cleanup B (test data)").waitFor({ state: "detached", timeout: 30_000 });
      await page.getByText("Demo cleanup C (test data)").waitFor({ timeout: 30_000 });
      expect(await page.getByText(b.pr_number).count()).toBe(0);
      // The dialog keeps its own count while it closes.
      expect(await page.getByText(/Delete 0 /).count()).toBe(0);
      await shot(page, "32-demo-delete-done");
    });
  });

  it("Print sends the official documents to the printer, one request per sheet set, never the list (21 Oct 2026)", async () => {
    /** Synthetic lines; each starts with a marker such as T30-07, and every ninth is long. */
    const items = (tag: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        description:
          `${tag}-${String(i + 1).padStart(2, "0")} ` +
          (i % 9 === 4
            ? 'heavy duty wheelbarrow / buggy, 80 liters capacity, GA 16 with 2-13" solid tires, powder coated tray, replaceable handle grips, for construction and maintenance crews (test data)'
            : "supply item, 500 ml (test data)"),
        quantity: (i % 7) + 2,
        unit: ["bottle", "pc", "box", "ream"][i % 4],
        estimatedCost: 50 + i * 15,
      }));
    const sizes = [1, 10, 30, 50];
    const filed: { tag: string; n: number; pr_number: string; total: number }[] = [];
    for (const n of sizes) {
      const tag = `T${n}`;
      const lines = items(tag, n);
      const { pr_number } = await filePortalRequest(`Print check with ${n} items (test data)`, lines);
      filed.push({ tag, n, pr_number, total: lines.reduce((s, it) => s + it.quantity * it.estimatedCost, 0) });
    }
    const peso = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const pdfjs = await import(
      pathToFileURL(path.resolve(__dirname, "../../node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href
    );
    const pagesOf = async (file: string) => {
      const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        pages.push(content.items.map((it: { str?: string }) => it.str ?? "").join(" "));
      }
      return pages;
    };
    /** Checks one request's document: every line once and in order, the total, then the signatures. */
    const checkDocument = (text: string, f: (typeof filed)[number]) => {
      let at = -1;
      for (let k = 1; k <= f.n; k++) {
        const marker = `${f.tag}-${String(k).padStart(2, "0")} `;
        const found = text.indexOf(marker);
        expect(found, `${marker} printed after the line before it`).toBeGreaterThan(at);
        expect(text.indexOf(marker, found + 1), `${marker} printed once`).toBe(-1);
        at = found;
      }
      expect(text).toContain(peso(f.total));
      expect(text.indexOf("Requested by:")).toBeGreaterThan(at);
      // Settings had answered before printing: the draft shows the configured names.
      // Requested by is the General Services Officer, though the Municipal Health Office filed these.
      for (const name of ["TEST GSO SIGNATORY", "General Services Officer", "TEST TREASURER", "TEST MAYOR"]) expect(text).toContain(name);
      expect(text).not.toContain("Maria Santos (");
      expect(text).not.toContain("not yet configured");
      expect(text).toContain(`GSO PRIMS reference ${f.pr_number}`);
    };
    // Nothing of the admin screen.
    const noScreen = (pages: string[]) => {
      for (const p of pages) {
        expect(p.trim().length, "no blank pages").toBeGreaterThan(0);
        for (const ui of ["New purchase request", "Search PR number", "Review what the offices filed", "Inventory", "selected"]) {
          expect(p).not.toContain(ui);
        }
      }
    };

    await session("print-list", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/purchase-requests`);
      await page.getByText("Print check with 50 items (test data)").waitFor({ timeout: 30_000 });
      // The browser's print dialog is replaced by a counter; the PDF is made from print media instead.
      await page.evaluate(() => {
        const w = window as unknown as { __prints: number };
        w.__prints = 0;
        window.print = () => {
          w.__prints += 1;
        };
      });
      const printed = (n: number) => page.waitForFunction((n) => (window as unknown as { __prints: number }).__prints === n, n);

      // One request from its row: only that document.
      const ten = filed[1];
      await page.getByRole("button", { name: `Actions for ${ten.pr_number}` }).click();
      await page.getByRole("menuitem", { name: "Print request" }).click();
      await printed(1);
      expect(await page.title()).toBe(`Purchase Request ${ten.pr_number}`);
      await page.emulateMedia({ media: "print" });
      const single = path.join(SHOTS, "52-print-one-request.pdf");
      await page.pdf({ path: single, format: "A4", printBackground: true });
      await page.emulateMedia({ media: "screen" });
      const one = await pagesOf(single);
      expect(one).toHaveLength(1);
      noScreen(one);
      checkDocument(one.join(" "), ten);
      for (const other of [filed[0], filed[2], filed[3]]) expect(one.join(" ")).not.toContain(other.pr_number);

      // All four selected: one print job, each request starting on its own sheet, in list order.
      await page.getByRole("checkbox", { name: "Select all rows" }).check();
      await page.getByRole("button", { name: "Print 4" }).click();
      await printed(2);
      expect(await page.title()).toBe("Purchase Requests (4)");
      await page.emulateMedia({ media: "print" });
      const batch = path.join(SHOTS, "53-print-four-requests.pdf");
      await page.pdf({ path: batch, format: "A4", printBackground: true });
      const pages = await pagesOf(batch);
      noScreen(pages);

      // Each document begins on a fresh page with the title, and ends with its own reference.
      const starts = pages.flatMap((p, i) => (p.includes("PURCHASE REQUEST") ? [i] : []));
      expect(starts).toHaveLength(4);
      expect(starts[0]).toBe(0);
      const newestFirst = [...filed].reverse();
      newestFirst.forEach((f, d) => {
        const text = pages.slice(starts[d], starts[d + 1] ?? pages.length).join(" ");
        checkDocument(text, f);
        for (const other of filed) if (other !== f) expect(text).not.toContain(`reference ${other.pr_number}`);
      });
      // The long requests run onto more sheets, with the column heads repeated.
      const fifty = pages.slice(starts[0], starts[1]);
      expect(fifty.length).toBeGreaterThan(1);
      for (const p of fifty) expect(p).toContain("Item Description");
      expect(pages.slice(starts[3])).toHaveLength(1);
    });
  });

  it("the bell shows the submission, and an audit entry shows its record's timeline without comments", async () => {
    await filePortalRequest("Notification check (test data)");
    await session("bell-audit", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.getByRole("button", { name: /Notifications \(/ }).click({ timeout: 30_000 });
      await page.getByText("New Purchase Request Submitted").first().waitFor();
      await shot(page, "40-notifications");
      await page.keyboard.press("Escape");

      await page.goto(`${APP_URL}/audit`);
      await page.getByText("Record Created").first().click({ timeout: 30_000 });
      const drawer = page.getByRole("dialog");
      await drawer.getByRole("tab", { name: "Record timeline" }).waitFor({ timeout: 30_000 });
      expect(await drawer.getByRole("tab", { name: "Session history" }).count()).toBe(1);
      // Reviewer comments are not shown on audit entries (30 Oct 2026); stored ones stay.
      expect(await drawer.getByRole("tab", { name: /Comments/ }).count()).toBe(0);
      await shot(page, "41-audit-entry");
    });
  });

  it("the printed purchase request renders to PDF with its number", async () => {
    const { pr_number } = await filePortalRequest("Printed request (test data)");
    await session("print", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await openRequest(page, "Printed request (test data)");
      await page.emulateMedia({ media: "print" });
      const file = path.join(SHOTS, "50-purchase-request.pdf");
      await page.pdf({ path: file, format: "A4", printBackground: true });
      const pdfjs = await import(
        pathToFileURL(path.resolve(__dirname, "../../node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href
      );
      const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise;
      let text = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        text += content.items.map((it: { str?: string }) => it.str ?? "").join(" ");
      }
      expect(text).toContain(pr_number);
      expect(text.toUpperCase()).toContain("PURCHASE REQUEST");
    });
  });
});
