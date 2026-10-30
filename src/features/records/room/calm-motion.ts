import { useReducedMotion } from "motion/react";

/**
 * A computer with few cores or little memory (30 Oct 2026): the office PCs.
 * There the Records Room keeps its fades and drops the decorative movement —
 * the lid, the dropping folder — so browsing stays quick. Read once.
 */
export const LOW_POWER =
  typeof navigator !== "undefined" &&
  ((navigator.hardwareConcurrency ?? 8) <= 4 || ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4);

/** True when movement should be kept to fades: asked for by the system, or a low-power computer. */
export function useCalmMotion(): boolean {
  return (useReducedMotion() ?? false) || LOW_POWER;
}
