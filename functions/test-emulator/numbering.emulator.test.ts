import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { allocateDocumentNumber } from "../src/numbering.js";
import { clearFirestore, connect, disconnect } from "./setup.js";

let db: Firestore;

// Same retry allowance as the nextDocumentNumber callable.
const allocate = (type: string, year = 2026) =>
  db.runTransaction((tx) => allocateDocumentNumber(tx, type, year), { maxAttempts: 10 });

const counter = async (id: string) => (await db.doc(`document_counters/${id}`).get()).data();

const setting = (key: string, value: unknown) =>
  db.doc(`system_configuration/cfg-${key}`).set({ category: "Document Numbering", key, value });

beforeAll(() => {
  db = connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearFirestore();
});

describe("allocating numbers", () => {
  it("issues consecutive numbers in the existing format", async () => {
    expect(await allocate("PR")).toBe("PR-2026-000001");
    expect(await allocate("PR")).toBe("PR-2026-000002");
    expect(await allocate("RIS")).toBe("RIS-2026-000001");
    expect(await counter("PR-2026")).toMatchObject({ current_sequence: 2, year: 2026, last_year: 2026 });
  });

  it("uses padding and separator from Settings", async () => {
    await setting("padding_length", "4");
    await setting("separator", '"/"');
    expect(await allocate("RIS")).toBe("RIS/2026/0001");
  });
});

describe("concurrent requests", () => {
  it("never give two callers the same number", async () => {
    const numbers = await Promise.all(Array.from({ length: 20 }, () => allocate("FR")));
    expect(new Set(numbers).size).toBe(20);
    const sequences = numbers.map((n) => Number(n.split("-")[2])).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});

describe("year transitions", () => {
  it("restart at 1 in a new year and keep counting from there (the January 2027 bug)", async () => {
    await db.doc("document_counters/PR-2026").set({
      document_type: "PR", year: 2026, current_sequence: 900, last_year: 2026,
    });
    expect(await allocate("PR", 2027)).toBe("PR-2027-000001");
    expect(await allocate("PR", 2027)).toBe("PR-2027-000002");
    expect(await allocate("PR", 2027)).toBe("PR-2027-000003");
  });

  it("switching the yearly reset off continues above the highest number, then on again does not collide", async () => {
    await db.doc("document_counters/PO-2026").set({
      document_type: "PO", year: 2026, current_sequence: 300, last_year: 2026,
    });
    await setting("year_reset", "false");
    expect(await allocate("PO")).toBe("PO-2026-000301");
    expect(await allocate("PO")).toBe("PO-2026-000302");
    await setting("year_reset", "true");
    expect(await allocate("PO")).toBe("PO-2026-000303");
  });
});

describe("duplicate prevention", () => {
  it("skips numbers already used by saved records", async () => {
    await db.doc("document_counters/PR-2026").set({
      document_type: "PR", year: 2026, current_sequence: 4, last_year: 2026,
    });
    await db.doc("purchase_requests/PR-2026-000005").set({ pr_number: "PR-2026-000005" });
    await db.doc("purchase_requests/PR-2026-000006").set({ pr_number: "PR-2026-000006" });
    expect(await allocate("PR")).toBe("PR-2026-000007");
    expect(await counter("PR-2026")).toMatchObject({ current_sequence: 7 });
  });

  it("stops rather than search forever when the counter is far behind, and changes nothing", async () => {
    const batch = db.batch();
    for (let i = 1; i <= 30; i++) {
      const n = `PR-2026-${String(i).padStart(6, "0")}`;
      batch.set(db.doc(`purchase_requests/${n}`), { pr_number: n });
    }
    await batch.commit();
    await expect(allocate("PR")).rejects.toThrow(/behind the saved records/);
    expect(await counter("PR-2026")).toBeUndefined();
  });
});

describe("failed operations", () => {
  it("a transaction that fails after allocating does not spend the number", async () => {
    await expect(
      db.runTransaction(async (tx) => {
        await allocateDocumentNumber(tx, "PR", 2026);
        throw new Error("saving the purchase request failed");
      }),
    ).rejects.toThrow("saving the purchase request failed");
    expect(await counter("PR-2026")).toBeUndefined();
    expect(await allocate("PR")).toBe("PR-2026-000001");
  });

  // Documents the known limit: today the browser saves the record after the
  // number is allocated, in a separate step. If that save fails, the number
  // is spent and never used. Gap-free numbering needs both in one transaction.
  it("a number allocated but never saved leaves a gap", async () => {
    await allocate("PR");
    expect(await allocate("PR")).toBe("PR-2026-000002");
  });
});
