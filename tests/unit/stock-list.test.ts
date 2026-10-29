import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/ris/api", () => ({ listStock: vi.fn() }));

import type { StockSuggestion } from "@/features/ris/api";
import { matchStock } from "@/features/ris/components/ris-form/stock-list";

const item = (name: string, code = ""): StockSuggestion => ({ id: name, code, name, unit: "pc", inStock: true });

// A to Z, as portalStockSuggestions returns the list.
const stock = [
  item("Ballpen, black"),
  item("Bond paper, A4", "INV-2026-000004"),
  item("Clip, binder"),
  item("Correction fluid"),
  item("Correction Tape", "INV-2026-000007"),
  item("Masking tape"),
];

const names = (query: string) => matchStock(stock, query).map((s) => s.name);

describe("the portal's item picker (29 Oct 2026)", () => {
  it("shows the whole list before anything is typed", () => {
    expect(names("")).toEqual(stock.map((s) => s.name));
    expect(names("   ")).toEqual(stock.map((s) => s.name));
  });

  it("narrows from the first letter, ignoring case, names starting with the text first", () => {
    expect(names("c")).toEqual(["Clip, binder", "Correction fluid", "Correction Tape", "Ballpen, black"]);
    expect(names("Co")).toEqual(["Correction fluid", "Correction Tape"]);
    expect(names("COR")).toEqual(["Correction fluid", "Correction Tape"]);
    // "Correction fluid" has a t too, but only Tape starts with the whole text.
    expect(names("correction t")).toEqual(["Correction Tape", "Correction fluid"]);
  });

  it("matches anywhere in the name, words starting with the text before the rest", () => {
    expect(names("tape")).toEqual(["Correction Tape", "Masking tape"]);
    expect(names("ape")).toEqual(["Bond paper, A4", "Correction Tape", "Masking tape"]);
  });

  it("needs every word typed, in any order", () => {
    expect(names("tape corr")).toEqual(["Correction Tape"]);
    expect(names("paper a4")).toEqual(["Bond paper, A4"]);
    expect(names("tape fluid")).toEqual([]);
  });

  it("finds an item by its code", () => {
    expect(names("000007")).toEqual(["Correction Tape"]);
  });

  it("returns nothing for text that is on no item", () => {
    expect(names("stapler")).toEqual([]);
  });
});
