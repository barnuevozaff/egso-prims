import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  APP_URL,
  SHOTS,
  createStaff,
  filePortalRequest,
  launch,
  newPage,
  resetEmulators,
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
  await createStaff("admin@alaminos.gov.ph", "Administrator", {}, "Ana Reyes");
  await createStaff("dept@alaminos.gov.ph", "Department User", {}, "Dante Cruz");
  await createStaff("approver@alaminos.gov.ph", "Department User", { approver: true }, "Alma Dizon");
  await createStaff("viewer@alaminos.gov.ph", "Viewer", {}, "Vic Santos");
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
      await page.getByPlaceholder("Search office or code…").fill("GSO");
      await page.getByRole("option", { name: "GSO", exact: true }).click();
      await page.getByLabel("Requested by").fill("Juan Dela Cruz");
      await page.getByLabel("Purpose").fill("Bond paper for Q4 reports (test data)");
      await page.getByLabel("Item 1 description").fill("Bond paper, A4");
      await page.getByLabel("Item 1 quantity").fill("10");
      await page.getByLabel("Item 1 unit cost in pesos").fill("250");
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

  it("only deciders see Approve and Return; others see neither", async () => {
    const purpose = "Clinic supplies (test data)";
    await filePortalRequest(purpose);

    for (const email of ["dept@alaminos.gov.ph", "viewer@alaminos.gov.ph"]) {
      await session(`no-decide-${email}`, async (page) => {
        await signIn(page, email);
        await openRequest(page, purpose);
        for (const hidden of ["Approve", "Return", "Edit", "Mark Completed"]) {
          expect(await drawerButton(page, hidden).count()).toBe(0);
        }
        await shot(page, `20-drawer-${email.split("@")[0]}`);
      });
    }

    await session("approver", async (page) => {
      await signIn(page, "approver@alaminos.gov.ph");
      await openRequest(page, purpose);
      expect(await drawerButton(page, "Return").count()).toBe(1);
      await drawerButton(page, "Approve").click();
      await page.getByRole("dialog", { name: "Advance to Approved?" }).getByRole("button", { name: "Approve" }).click();
      await drawerButton(page, "Mark Completed").waitFor({ timeout: 30_000 });
      await shot(page, "21-drawer-approved");
    });
  });

  it("an Administrator voids a request from the list, with a reason, and it stays on record", async () => {
    const purpose = "Duplicate request (test data)";
    await filePortalRequest(purpose);
    await session("void", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.goto(`${APP_URL}/purchase-requests`);
      await page.getByText(purpose).first().waitFor();
      await page.getByRole("checkbox", { name: "Select row" }).first().check();
      expect(await page.getByRole("button", { name: "Delete" }).count()).toBe(0);
      await page.getByRole("button", { name: "Void" }).click();
      const dialog = page.getByRole("dialog", { name: /^Void 1 purchase request/ });
      await dialog.getByRole("button", { name: "Void" }).click();
      await dialog.getByText(/Give a reason/).waitFor();
      await dialog.getByLabel("Reason").fill("Filed twice by the requesting office");
      await dialog.getByRole("button", { name: "Void" }).click();
      await page.getByText(/Voided 1 purchase request/).waitFor({ timeout: 30_000 });
      await page.getByRole("tab", { name: /Cancelled/ }).click();
      await page.getByText(purpose).first().waitFor();
      await shot(page, "30-list-voided");
    });
  });

  it("the bell shows the submission, and an audit comment carries the reviewer's name", async () => {
    await filePortalRequest("Notification check (test data)");
    await session("bell-audit", async (page) => {
      await signIn(page, "admin@alaminos.gov.ph");
      await page.getByRole("button", { name: /Notifications \(/ }).click({ timeout: 30_000 });
      await page.getByText("New Purchase Request Submitted").first().waitFor();
      await shot(page, "40-notifications");
      await page.keyboard.press("Escape");

      await page.goto(`${APP_URL}/audit`);
      await page.getByText("Record Created").first().click({ timeout: 30_000 });
      await page.getByRole("tab", { name: /Comments/ }).click();
      await page.getByPlaceholder("Write a comment…").fill("Checked against the paper form.");
      await page.getByRole("button", { name: "Comment" }).click();
      await page.getByRole("tab", { name: "Comments (1)" }).waitFor({ timeout: 30_000 });
      expect(await page.getByRole("dialog").getByText("Ana Reyes").count()).toBeGreaterThan(0);
      await shot(page, "41-audit-comment");
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
