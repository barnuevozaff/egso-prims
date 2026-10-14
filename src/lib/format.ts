/** Formatting helpers shared across the component library. */

export type CountKind = "int" | "percent" | "k" | "plus" | "peso";

export function formatCount(n: number, kind: CountKind = "int"): string {
  if (kind === "peso") return formatPHP(Math.round(n));
  if (kind === "percent") return n.toFixed(1) + "%";
  if (kind === "k") return Math.round(n) + "K";
  if (kind === "plus") return Math.round(n) + "+";
  return Math.round(n).toLocaleString();
}

/** Philippine Peso display, e.g. ₱128,450 or ₱18.4M (compact). */
export function formatPHP(
  amount: number,
  options: { compact?: boolean; decimals?: number } = {},
): string {
  const { compact = false, decimals } = options;
  if (compact) {
    if (Math.abs(amount) >= 1_000_000) {
      return "₱" + (amount / 1_000_000).toFixed(decimals ?? 1).replace(/\.0$/, "") + "M";
    }
    if (Math.abs(amount) >= 1_000) {
      return "₱" + (amount / 1_000).toFixed(decimals ?? 1).replace(/\.0$/, "") + "K";
    }
  }
  return (
    "₱" +
    amount.toLocaleString("en-PH", {
      minimumFractionDigits: decimals ?? 0,
      maximumFractionDigits: decimals ?? 2,
    })
  );
}
