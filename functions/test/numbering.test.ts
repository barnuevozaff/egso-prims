import { describe, expect, it } from "vitest";

import { formatDocumentNumber, manilaYear, nextSequence, parseSettings } from "../src/numbering.js";

describe("manilaYear", () => {
  it("turns the year at midnight in Manila, not at midnight UTC", () => {
    // 31 Dec 2026, 23:59 in Manila is 15:59 UTC.
    expect(manilaYear(new Date("2026-12-31T15:59:59Z"))).toBe(2026);
    // 1 Jan 2027, 00:00 in Manila is still 31 Dec 2026, 16:00 UTC.
    expect(manilaYear(new Date("2026-12-31T16:00:00Z"))).toBe(2027);
    // 1 Jan 2027, 07:59 in Manila — the hours UTC got wrong.
    expect(manilaYear(new Date("2026-12-31T23:59:00Z"))).toBe(2027);
  });
});

describe("formatDocumentNumber", () => {
  it("matches the numbers already issued", () => {
    expect(formatDocumentNumber("pr", 2026, 243, { padding: 6, separator: "-" })).toBe("PR-2026-000243");
  });

  it("uses the configured separator and padding", () => {
    expect(formatDocumentNumber("RIS", 2026, 7, { padding: 4, separator: "/" })).toBe("RIS/2026/0007");
  });

  it("never truncates a sequence longer than the padding", () => {
    expect(formatDocumentNumber("PO", 2026, 1234567, { padding: 6, separator: "-" })).toBe("PO-2026-1234567");
  });
});

describe("nextSequence (next_document_number, migrations 032 and 035)", () => {
  it("starts a type at 1", () => {
    expect(nextSequence([], 2026, true)).toEqual({ keyYear: 2026, sequence: 1 });
  });

  it("counts up within a year", () => {
    expect(nextSequence([{ year: 2026, currentSequence: 41 }], 2026, true)).toEqual({
      keyYear: 2026,
      sequence: 42,
    });
  });

  it("restarts at 1 in a new year when the yearly reset is on", () => {
    expect(nextSequence([{ year: 2025, currentSequence: 900 }], 2026, true)).toEqual({
      keyYear: 2026,
      sequence: 1,
    });
  });

  // The January bug in the Supabase function: greatest(current + 1,
  // max_all + 1) made the second number of a new year jump past the whole
  // previous year (PR-2027-000001, then PR-2027-000901).
  it("keeps counting from 1 after the first number of a new year", () => {
    const counters = [
      { year: 2025, currentSequence: 900 },
      { year: 2026, currentSequence: 1 },
    ];
    expect(nextSequence(counters, 2026, true).sequence).toBe(2);
  });

  it("continues after this year's continuous numbers when the reset is switched back on", () => {
    // Reset on until 640, off for a while (continuous counter reached 700,
    // printed with 2026), then on again the same year.
    const counters = [
      { year: 2026, currentSequence: 640 },
      { year: 0, currentSequence: 700, lastYear: 2026 },
    ];
    expect(nextSequence(counters, 2026, true)).toEqual({ keyYear: 2026, sequence: 701 });
  });

  it("ignores the continuous counter when it last printed an earlier year", () => {
    const counters = [{ year: 0, currentSequence: 700, lastYear: 2026 }];
    expect(nextSequence(counters, 2027, true)).toEqual({ keyYear: 2027, sequence: 1 });
  });

  it("treats a continuous counter with no recorded year as possibly this year's (no duplicates)", () => {
    const counters = [{ year: 0, currentSequence: 700 }];
    expect(nextSequence(counters, 2027, true).sequence).toBe(701);
  });

  it("keeps one running sequence under year 0 when the reset is off", () => {
    expect(nextSequence([{ year: 0, currentSequence: 15 }], 2026, false)).toEqual({
      keyYear: 0,
      sequence: 16,
    });
  });

  it("never reuses a number when the reset is switched off", () => {
    expect(nextSequence([{ year: 2026, currentSequence: 300 }], 2026, false)).toEqual({
      keyYear: 0,
      sequence: 301,
    });
  });
});

describe("parseSettings", () => {
  it("defaults to 6 digits, '-' and the yearly reset", () => {
    expect(parseSettings([])).toEqual({ padding: 6, separator: "-", yearReset: true });
  });

  it("reads the JSON-encoded values migrated from Postgres jsonb", () => {
    const rows = [
      { key: "padding_length", value: "4" },
      { key: "separator", value: '"/"' },
      { key: "year_reset", value: "false" },
    ];
    expect(parseSettings(rows)).toEqual({ padding: 4, separator: "/", yearReset: false });
  });

  it("reads native Firestore values", () => {
    const rows = [
      { key: "padding_length", value: 5 },
      { key: "separator", value: "-" },
      { key: "year_reset", value: true },
    ];
    expect(parseSettings(rows)).toEqual({ padding: 5, separator: "-", yearReset: true });
  });

  it("ignores a nonsensical padding", () => {
    expect(parseSettings([{ key: "padding_length", value: "-3" }]).padding).toBe(6);
  });
});
