import { describe, expect, it } from "vitest";

import { friendlyFirebaseError, matchesSearch } from "../../src/lib/firestore";

describe("friendlyFirebaseError", () => {
  it("never shows Firestore's rule details to the user", () => {
    const fromEmulator = { code: "permission-denied", message: "\nfalse for 'list' @ L119, false for 'list' @ L230" };
    expect(friendlyFirebaseError(fromEmulator).message).toBe("You don't have permission to perform this action.");
  });

  it("keeps a Cloud Function's own explanation", () => {
    const fromFunction = { code: "functions/permission-denied", message: "Viewers cannot file reservations." };
    expect(friendlyFirebaseError(fromFunction).message).toBe("Viewers cannot file reservations.");
    const conflict = { code: "functions/failed-precondition", message: "Schedule conflict with FR-2026-000001 — pick another slot." };
    expect(friendlyFirebaseError(conflict).message).toBe(conflict.message);
    const duplicate = { code: "functions/already-exists", message: "A bill for that account and billing period already exists." };
    expect(friendlyFirebaseError(duplicate).message).toBe(duplicate.message);
  });

  it("gives the same messages as the Supabase helper for connection problems", () => {
    expect(friendlyFirebaseError({ code: "unavailable", message: "x" }).message).toBe(
      "Unable to reach the server. Check your connection and try again.",
    );
    expect(friendlyFirebaseError({ code: "already-exists", message: "x" }).message).toBe(
      "A record with that identifier already exists.",
    );
  });
});

describe("matchesSearch (the browser-side searchOr)", () => {
  const row = { id: "PR-2026-000001", pr_number: "PR-2026-000001", purpose: "Bond Paper, A4", requester: "Juan" };

  it("matches any listed field, ignoring case", () => {
    expect(matchesSearch(row, ["pr_number", "purpose"], "bond paper")).toBe(true);
    expect(matchesSearch(row, ["pr_number", "purpose"], "000001")).toBe(true);
    expect(matchesSearch(row, ["pr_number"], "juan")).toBe(false);
  });

  it("normalises the query the way searchOr did", () => {
    expect(matchesSearch(row, ["purpose"], "  %bond%  ")).toBe(true);
    expect(matchesSearch(row, ["purpose"], "")).toBe(true);
    expect(matchesSearch(row, ["purpose"], undefined)).toBe(true);
  });
});
