import fs from "node:fs";
import path from "node:path";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

/**
 * Browser helpers: the installed Chrome, driven by playwright-core (no
 * browser download), against the app running on the emulators. Accounts are
 * created through the Auth emulator; every record is synthetic.
 */

export const APP_URL = "http://127.0.0.1:5174";
const PROJECT_ID = "demo-egso-prims";
const AUTH = "http://127.0.0.1:9099";
const FIRESTORE = "http://127.0.0.1:8085";
export const PASSWORD = "test-password-1";

/** Where screenshots go: E2E_SCREENSHOTS, or a temporary folder. */
export const SHOTS = process.env.E2E_SCREENSHOTS ?? path.join(process.env.TEMP ?? "/tmp", "gso-prims-e2e");

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
];

export async function launch(): Promise<Browser> {
  const executablePath = CHROME_PATHS.find((p) => p && fs.existsSync(p));
  if (!executablePath) throw new Error("No Chrome or Edge found; set CHROME_PATH.");
  fs.mkdirSync(SHOTS, { recursive: true });
  return chromium.launch({ executablePath, headless: true });
}

/** A fresh browser profile at the desktop size the design is checked at. */
export async function newPage(browser: Browser): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  const context = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}

export async function shot(page: Page, name: string): Promise<string> {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

/* ---------------- emulator data ---------------- */

async function auditCount(): Promise<number> {
  const res = await fetch(`${FIRESTORE}/v1/projects/${PROJECT_ID}/databases/(default)/documents/audit_logs?pageSize=300`, {
    headers: { Authorization: "Bearer owner" },
  });
  return ((await res.json()) as { documents?: unknown[] }).documents?.length ?? 0;
}

/** Empties Firestore and Auth, waiting out the audit entries the clear itself causes. */
export async function resetEmulators(): Promise<void> {
  const clear = () =>
    fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  await clear();
  let last = -1;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const count = await auditCount();
    if (count === last) break;
    last = count;
  }
  await clear();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
}

/** A staff account with a role, as setStaffRole leaves it. */
export async function createStaff(
  email: string,
  role: string,
  extra: Record<string, unknown> = {},
  displayName?: string,
): Promise<string> {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const { localId } = (await res.json()) as { localId: string };
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ localId, displayName, customAttributes: JSON.stringify({ role, ...extra }) }),
  });
  return localId;
}

/** Files a purchase request the way the public portal does (the create function). */
export async function filePortalRequest(purpose: string): Promise<{ id: string; pr_number: string }> {
  const res = await fetch(`http://127.0.0.1:5001/${PROJECT_ID}/asia-southeast1/createPurchaseRequest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        input: {
          departmentCode: "MHO",
          requester: "Maria Santos",
          purpose,
          fundingSource: "General Fund",
          requestDate: "2026-10-19",
          items: [{ description: "Alcohol, 500 ml", quantity: 5, unit: "bottle", estimatedCost: 90 }],
          attachments: [],
        },
      },
    }),
  });
  return ((await res.json()) as { result: { id: string; pr_number: string } }).result;
}

/* ---------------- app actions ---------------- */

export async function signIn(page: Page, email: string, remember = false): Promise<void> {
  await page.goto(`${APP_URL}/login`);
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  if (remember) await page.getByLabel("Keep me signed in on this computer").check();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}
