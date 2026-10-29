import type { Browser } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { APP_URL, createAccount, launch, newPage, resetEmulators, shot, signIn } from "./browser";

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
  await createAccount("newhire@alaminos.gov.ph");
});

/**
 * Where Firebase kept the session: localStorage (browserLocalPersistence,
 * kept after the browser closes) or sessionStorage (this tab only).
 */
async function sessionStore(page: import("playwright-core").Page) {
  return page.evaluate(() => ({
    inSession: Object.keys(sessionStorage).some((k) => k.startsWith("firebase:authUser")),
    persistent: Object.keys(localStorage).some((k) => k.startsWith("firebase:authUser")),
  }));
}

describe("signing in with Firebase Authentication", () => {
  it("sends a signed-out visitor from a staff page to the sign-in page", async () => {
    const { context, page } = await newPage(browser);
    await page.goto(`${APP_URL}/purchase-requests`);
    await page.waitForURL(/\/login$/);
    await page.getByRole("heading", { name: "Sign in" }).waitFor();
    await shot(page, "01-login");
    await context.close();
  });

  it("an Administrator signs in, reaches the dashboard, and sees their own name", async () => {
    const { context, page, errors } = await newPage(browser);
    await signIn(page, "admin@alaminos.gov.ph");
    await page.getByText("Needs your attention").first().waitFor({ timeout: 30_000 });
    expect(await page.getByText("Ana Reyes").first().isVisible()).toBe(true);
    expect(errors).toEqual([]);
    await shot(page, "02-dashboard-admin");
    await context.close();
  });

  it("'Keep me signed in' decides where the session is kept", async () => {
    const tabOnly = await newPage(browser);
    await signIn(tabOnly.page, "admin@alaminos.gov.ph", false);
    expect(await sessionStore(tabOnly.page)).toEqual({ inSession: true, persistent: false });
    await tabOnly.context.close();

    const kept = await newPage(browser);
    await signIn(kept.page, "admin@alaminos.gov.ph", true);
    expect(await sessionStore(kept.page)).toEqual({ inSession: false, persistent: true });
    // Reloading keeps the person signed in.
    await kept.page.reload();
    await kept.page.getByText("Needs your attention").first().waitFor({ timeout: 30_000 });
    await kept.context.close();
  });

  it("refuses a wrong password with a clear message; any account added in the console signs in", async () => {
    const { context, page } = await newPage(browser);
    await page.goto(`${APP_URL}/login`);
    await page.getByLabel("Email Address").fill("admin@alaminos.gov.ph");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByText("Incorrect email or password.").waitFor();

    await page.getByLabel("Email Address").fill("newhire@alaminos.gov.ph");
    await page.getByLabel("Password", { exact: true }).fill("test-password-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    // No claims, no office role: every account is an Administrator (29 Oct 2026).
    await page.getByText("Needs your attention").first().waitFor({ timeout: 30_000 });
    await shot(page, "03-login-new-account");
    await context.close();
  });

});
