import { getAuth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH, call, signUp, staffToken, waitFor } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * The deployed functions, end to end, in the Functions emulator: triggers
 * fire on real writes, callables are called over HTTP as a browser would.
 * Synthetic data only; demo project only.
 */

let db: Firestore;

beforeAll(() => {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("FIREBASE_AUTH_EMULATOR_HOST must point at the local emulator; refusing to run.");
  }
  db = connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
});

describe("auditTrail trigger", () => {
  it("records a new purchase request in the audit trail", async () => {
    await db.doc("purchase_requests/PR-2026-000042").set({
      id: "PR-2026-000042", pr_number: "PR-2026-000042", status: "Submitted",
    });
    const entry = await waitFor(async () => {
      const snap = await db.collection("audit_logs").where("document_number", "==", "PR-2026-000042").get();
      return snap.docs[0]?.data();
    });
    expect(entry).toMatchObject({
      module: "Purchase Requests",
      action: "Record Created",
      updated_value: "Status: Submitted",
      severity: "Information",
    });
    expect(String(entry.id)).toMatch(/^AUD-\d{4}-\d{4}$/);
  });

  it("does not audit notifications, counters or itself", async () => {
    await db.doc("notifications/n-unaudited").set({ title: "x", is_read: false });
    await db.doc("document_counters/ZZ-2026").set({ document_type: "ZZ", current_sequence: 1 });
    await new Promise((r) => setTimeout(r, 3000));
    // Clearing the emulator between tests deletes the previous test's
    // records, which the trigger rightly audits; only look for these two.
    for (const id of ["n-unaudited", "ZZ-2026"]) {
      const snap = await db.collection("audit_logs").where("document_number", "==", id).get();
      expect(snap.size).toBe(0);
    }
  });

  it("records a deletion as critical", async () => {
    await db.doc("fuel_vehicles/v-1").set({ plate_number: "SAB-1234" });
    await waitFor(async () =>
      !(await db.collection("audit_logs").where("document_number", "==", "SAB-1234").get()).empty,
    );
    await db.doc("fuel_vehicles/v-1").delete();
    const deleted = await waitFor(async () => {
      const snap = await db
        .collection("audit_logs")
        .where("document_number", "==", "SAB-1234")
        .where("action", "==", "Record Deleted")
        .get();
      return snap.docs[0]?.data();
    });
    expect(deleted).toMatchObject({ severity: "Critical", module: "Fuel Consumption" });
  });
});

describe("cascadeDeletes trigger", () => {
  it("deleting an energy account removes its bills, submeters and their bills", async () => {
    await db.doc("energy_accounts/acc-1").set({ account_number: "EA-0001" });
    await db.doc("energy_bills/bill-1").set({ account_id: "acc-1" });
    await db.doc("energy_submeters/sub-1").set({ account_id: "acc-1" });
    await db.doc("energy_submeter_bills/sb-1").set({ submeter_id: "sub-1" });
    await db.doc("energy_bills/other").set({ account_id: "acc-2" });

    await db.doc("energy_accounts/acc-1").delete();

    await waitFor(async () => {
      const left = await Promise.all(
        ["energy_bills/bill-1", "energy_submeters/sub-1", "energy_submeter_bills/sb-1"].map((p) =>
          db.doc(p).get(),
        ),
      );
      return left.every((d) => !d.exists);
    });
    expect((await db.doc("energy_bills/other").get()).exists).toBe(true);
  });
});

describe("nextDocumentNumber callable (staff only)", () => {
  it("gives the public no numbers at all", async () => {
    for (const type of ["PR", "RIS", "FR", "PO", "VT"]) {
      expect((await call("nextDocumentNumber", { type })).error?.status).toBe("PERMISSION_DENIED");
    }
  });

  it("refuses malformed types", async () => {
    const { token } = await staffToken("admin@alaminos.gov.ph", "Administrator");
    expect((await call("nextDocumentNumber", { type: "../x" }, token)).error?.status).toBe("INVALID_ARGUMENT");
  });

  it("numbers a type no function saves with its number", async () => {
    const { token } = await staffToken("admin@alaminos.gov.ph", "Administrator");
    const res = await call("nextDocumentNumber", { type: "ADJ" }, token);
    expect(res.result?.number).toMatch(/^ADJ-\d{4}-000001$/);
  });

  it("will not hand out a number apart from the document it belongs to", async () => {
    const { token } = await staffToken("admin@alaminos.gov.ph", "Administrator");
    for (const type of ["PR", "PO", "RIS", "FR", "EC", "WC", "FC", "VT", "RDS", "RIA", "RAD"]) {
      expect((await call("nextDocumentNumber", { type }, token)).error?.status).toBe("FAILED_PRECONDITION");
    }
  });

  it("refuses a Viewer", async () => {
    const { token } = await staffToken("viewer@alaminos.gov.ph", "Viewer");
    expect((await call("nextDocumentNumber", { type: "ADJ" }, token)).error?.status).toBe("PERMISSION_DENIED");
  });
});

describe("requireOfficeEmail blocking function", () => {
  it("lets office addresses sign up", async () => {
    const res = await signUp("new.clerk@alaminos.gov.ph");
    expect(res.localId).toBeTruthy();
  });

  it("refuses any other address", async () => {
    for (const email of ["someone@gmail.com", "x@alaminos.gov.ph.example.com"]) {
      const res = await signUp(email);
      expect(res.localId).toBeUndefined();
      expect(res.error?.message).toMatch(/PERMISSION_DENIED|not an office address/);
    }
  });
});

describe("setStaffRole callable", () => {
  it("lets an Administrator give an office account a role", async () => {
    const { token } = await staffToken("admin@alaminos.gov.ph", "Administrator");
    const target = await getAuth().createUser({ email: "dept@alaminos.gov.ph" });
    const res = await call("setStaffRole", { uid: target.uid, role: "Department User" }, token);
    expect(res.result).toMatchObject({ role: "Department User" });
    expect((await getAuth().getUser(target.uid)).customClaims?.role).toBe("Department User");
  });

  it("refuses everyone who is not an Administrator", async () => {
    const target = await getAuth().createUser({ email: "victim@alaminos.gov.ph" });
    const { token: dept } = await staffToken("dept@alaminos.gov.ph", "Department User");
    for (const idToken of [undefined, dept]) {
      const res = await call("setStaffRole", { uid: target.uid, role: "Administrator" }, idToken);
      expect(res.error?.status).toBe("PERMISSION_DENIED");
    }
    expect((await getAuth().getUser(target.uid)).customClaims?.role).toBeUndefined();
  });

  it("refuses unknown roles and accounts outside the office", async () => {
    const { token } = await staffToken("admin@alaminos.gov.ph", "Administrator");
    const outsider = await getAuth().createUser({ email: "outsider@gmail.com" });
    expect((await call("setStaffRole", { uid: outsider.uid, role: "Viewer" }, token)).error?.status).toBe(
      "FAILED_PRECONDITION",
    );
    expect((await call("setStaffRole", { uid: outsider.uid, role: "Superuser" }, token)).error?.status).toBe(
      "INVALID_ARGUMENT",
    );
  });

  it("stops an Administrator from removing their own role", async () => {
    const { uid, token } = await staffToken("admin@alaminos.gov.ph", "Administrator");
    expect((await call("setStaffRole", { uid, role: "Viewer" }, token)).error?.status).toBe("FAILED_PRECONDITION");
  });
});
