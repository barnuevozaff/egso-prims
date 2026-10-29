import { getApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertSetupTarget,
  freshStartCheck,
  seedSettings,
  settingId,
} from "../setup/provision.ts";
import { AUTH, call } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * Fresh-start setup on the emulators: the target guard, the office's settings
 * and the fresh-database check. Accounts are added in the Firebase console,
 * not by this tooling (29 Oct 2026; accounts.emulator.test.ts). Synthetic
 * data only.
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
