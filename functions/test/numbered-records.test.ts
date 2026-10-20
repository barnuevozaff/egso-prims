import { describe, expect, it } from "vitest";

import { normalizeName, SPECS, tripDerived } from "../src/documents/numbered-records.js";

describe("tripDerived — the columns migration 020 generated", () => {
  it("computes distance, total fuel, fuel used and ending fuel", () => {
    expect(
      tripDerived({ beginning_odometer: 1000, ending_odometer: 1080, km_per_liter: 10, beginning_fuel: 20, fuel_added: 5 }),
    ).toEqual({ distance_travelled: 80, fuel_total: 25, fuel_used: 8, ending_fuel: 17 });
  });

  it("leaves fuel used and ending fuel empty without a km/L rating, as nullif(km_per_liter, 0) did", () => {
    expect(
      tripDerived({ beginning_odometer: 0, ending_odometer: 50, km_per_liter: 0, beginning_fuel: 10, fuel_added: 0 }),
    ).toMatchObject({ distance_travelled: 50, fuel_used: null, ending_fuel: null });
  });
});

describe("normalizeName — the violators.name_key of migration 030", () => {
  it("drops punctuation, collapses spaces and folds case, as the browser copy does", () => {
    expect(normalizeName("NASOL, RICHARD")).toBe("nasol richard");
    expect(normalizeName("  Nasol,   Richard. ")).toBe("nasol richard");
    expect(normalizeName("Dela Cruz-Peña, Ma. Luisa")).toBe("dela cruzpeña ma luisa");
    expect(normalizeName("...")).toBe("");
  });
});

describe("numbered record specs", () => {
  it("compute a fuel transaction's total and a new ticket's unsettled state", () => {
    expect(SPECS.FC.derive?.({ liters: 40, price_per_liter: 62.5 })).toEqual({ total_amount: 2500 });
    expect(SPECS.VT.derive?.({ amount: 500 })).toMatchObject({
      payment_status: "Pending",
      amount_paid: 0,
      outstanding_balance: 500,
    });
  });

  it("key bills by account and period, so a second bill for the month is refused", () => {
    const row = { account_id: "ea-1", billing_year: 2026, billing_month: 9 };
    expect(SPECS.EC.periodId?.(row)).toBe("eb-ea-1-2026-09");
    expect(SPECS.WC.periodId?.({ ...row, account_id: "wa-1" })).toBe("wb-wa-1-2026-09");
    expect(SPECS.VT.periodId).toBeUndefined();
    expect(SPECS.VT.idFor({}, "VT-2026-000001")).toBe("VT-2026-000001");
  });
});
