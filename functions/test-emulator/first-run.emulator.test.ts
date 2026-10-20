import { getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertSetupTarget,
  freshStartCheck,
  provisionAccount,
  provisionFirstAdministrator,
  seedSettings,
  settingId,
} from "../setup/provision.ts";
import { AUTH, call, signUp } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * Fresh-start setup on the emulators: the first Administrator, staff roles,
 * the office's settings, the fresh-database check — and that nobody can
 * sign up and make themselves an Administrator. Synthetic accounts only.
 */

let db: Firestore;

beforeAll(() => {
  db = connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
});

describe("the setup target guard", () => {
  it("refuses both off-limits projects by name, in either mode", () => {
    for (const projectId of ["alaminos-municipality", "egso-2k26"]) {
      for (const remote of [false, true]) {
        expect(() => assertSetupTarget({ projectId, remote, confirm: projectId })).toThrow(/off-limits/);
      }
    }
  });

  it("runs remotely only against egso-b2c0a, confirmed, with no emulator variables", () => {
    expect(() => assertSetupTarget({ projectId: "some-other-project", remote: true, confirm: "some-other-project" })).toThrow(
      /only against egso-b2c0a/,
    );
    expect(() => assertSetupTarget({ projectId: "egso-b2c0a", remote: true })).toThrow(/--confirm-remote egso-b2c0a/);
    // The emulator variables are set in this test run, which a remote run refuses.
    expect(() => assertSetupTarget({ projectId: "egso-b2c0a", remote: true, confirm: "egso-b2c0a" })).toThrow(/Emulator variables/);
  });

  it("runs locally only under a demo project", () => {
    expect(() => assertSetupTarget({ projectId: "egso-b2c0a", remote: false })).toThrow(/demo-\*/);
    expect(() => assertSetupTarget({ projectId: PROJECT_ID, remote: false })).not.toThrow();
  });
});

describe("provisioning the first Administrator", () => {
  it("creates the account without a password, sets the role, and returns a one-time link", async () => {
    const p = await provisionFirstAdministrator(getAuth(), { email: "Head.GSO@alaminos.gov.ph", displayName: "Test Head" });
    expect(p).toMatchObject({ email: "head.gso@alaminos.gov.ph", role: "Administrator", approver: false, created: true });
    expect(p.passwordLink).toMatch(/oobCode=/);
    const user = await getAuth().getUser(p.uid);
    expect(user.customClaims).toMatchObject({ role: "Administrator", approver: false });
    expect(user.passwordHash).toBeUndefined();
  });

  it("is idempotent for the same person, and will not make a second Administrator", async () => {
    await provisionFirstAdministrator(getAuth(), { email: "head.gso@alaminos.gov.ph" });
    const again = await provisionFirstAdministrator(getAuth(), { email: "head.gso@alaminos.gov.ph" });
    expect(again.created).toBe(false);
    await expect(provisionFirstAdministrator(getAuth(), { email: "other@alaminos.gov.ph" })).rejects.toThrow(
      /An Administrator already exists \(head.gso@alaminos.gov.ph\)/,
    );
  });

  it("only gives roles to office addresses, and approver only to Department Users", async () => {
    await expect(provisionFirstAdministrator(getAuth(), { email: "someone@gmail.com" })).rejects.toThrow(/not an office address/);
    await expect(
      provisionAccount(getAuth(), { email: "viewer@alaminos.gov.ph", role: "Viewer", approver: true }),
    ).rejects.toThrow(/Only a Department User/);
    const dept = await provisionAccount(getAuth(), { email: "dept@alaminos.gov.ph", role: "Department User", approver: true });
    expect((await getAuth().getUser(dept.uid)).customClaims).toMatchObject({ role: "Department User", approver: true });
  });
});

describe("nobody can sign up and become an Administrator", () => {
  it("an outside address cannot even create an account", async () => {
    const res = await signUp("someone@gmail.com");
    expect(res.error?.message).toMatch(/not an office address|PERMISSION_DENIED|BLOCKING_FUNCTION/i);
  });

  it("an office address that signs up gets no role, and cannot give itself one", async () => {
    const res = await signUp("newcomer@alaminos.gov.ph");
    expect(res.localId).toBeTruthy();
    expect((await getAuth().getUser(res.localId!)).customClaims?.role).toBeUndefined();

    // Writing a role into its own account with its own token is refused.
    const update = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: res.idToken, customAttributes: JSON.stringify({ role: "Administrator" }) }),
    });
    const body = (await update.json()) as { error?: unknown };
    expect(update.ok && !body.error).toBe(false);
    expect((await getAuth().getUser(res.localId!)).customClaims?.role).toBeUndefined();

    // Nor through the app's role function.
    const self = await call("setStaffRole", { uid: res.localId, role: "Administrator" }, res.idToken);
    expect(self.error?.status).toBe("PERMISSION_DENIED");
  });
});

describe("settings and the fresh-database check", () => {
  it("writes the office's particulars under the Settings screen's IDs, never overwriting", async () => {
    const first = await seedSettings(db, { official_email: "gso.test@alaminos.gov.ph", padding_length: 6, year_reset: true }, "first-run-setup");
    expect(first.written.sort()).toEqual(["official_email", "padding_length", "year_reset"]);
    expect((await db.doc(`system_configuration/${settingId("General", "official_email")}`).get()).data()).toMatchObject({
      category: "General",
      key: "official_email",
      value: "gso.test@alaminos.gov.ph",
    });
    const second = await seedSettings(db, { official_email: "changed@alaminos.gov.ph" }, "first-run-setup");
    expect(second).toEqual({ written: [], kept: ["official_email"] });
    expect((await db.doc(`system_configuration/${settingId("General", "official_email")}`).get()).get("value")).toBe(
      "gso.test@alaminos.gov.ph",
    );
  });

  it("refuses settings that are not first-run settings, or of the wrong kind", async () => {
    await expect(seedSettings(db, { default_fine_amount: 500 }, "x")).rejects.toThrow(/not a first-run setting/);
    await expect(seedSettings(db, { padding_length: 0 }, "x")).rejects.toThrow(/whole number from 1 to 10/);
    await expect(seedSettings(db, { year_reset: "yes" }, "x")).rejects.toThrow(/a boolean/);
    expect((await db.collection("system_configuration").get()).empty).toBe(true);
  });

  it("calls an empty database fresh, and names whatever is not", async () => {
    // A database of its own: the audit trigger watches the default database,
    // and its late entries for the previous test's clean-up would otherwise
    // make this one look used.
    const fresh = getFirestore(getApp(), "fresh-check");
    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/fresh-check/documents`,
      { method: "DELETE" },
    );
    expect(await freshStartCheck(fresh)).toEqual({ fresh: true, notEmpty: {}, settings: 0 });
    await fresh.doc("purchase_requests/PR-2026-000001").set({ id: "PR-2026-000001" });
    await fresh.doc("document_counters/PR-2026").set({ current_sequence: 1 });
    const r = await freshStartCheck(fresh);
    expect(r.fresh).toBe(false);
    expect(r.notEmpty).toMatchObject({ purchase_requests: 1, document_counters: 1 });
  });

  it("a fresh database numbers its first documents from 000001, with no counters seeded", async () => {
    const year = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric" }).format(new Date());
    const res = await call("createPurchaseRequest", {
      input: {
        departmentCode: "GSO", requester: "Test Requester", purpose: "First request (test data)",
        fundingSource: "General Fund", requestDate: "2026-10-20",
        items: [{ description: "Bond paper", quantity: 1, unit: "ream", estimatedCost: 250 }], attachments: [],
      },
    });
    expect(res.result?.pr_number).toBe(`PR-${year}-000001`);
  });
});
