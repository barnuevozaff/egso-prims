import * as React from "react";

import { useConfiguration } from "@/features/config/hooks";
import { SIGNATORY_ROLES } from "@/features/config/types";
import type { POSignatory } from "@/features/purchase-orders/types";

/**
 * Settings → Purchase Order signatories now, for an order not yet authorized
 * (a draft preview). The roles and designations are the form's (fixed); only
 * the names come from Settings (21 Oct 2026).
 */
export interface CurrentPOSignatories {
  approvedBy: POSignatory | null;
  bacSecretary: POSignatory | null;
  /** True until Settings has answered: a document printed before then would show none. */
  loading: boolean;
}

const CATEGORY = "PO Signatories";
const ROLE = Object.fromEntries(SIGNATORY_ROLES[CATEGORY].map((r) => [r.key, r]));

export function useCurrentPOSignatories(): CurrentPOSignatories {
  const filters = React.useMemo(() => ({ category: CATEGORY }), []);
  const { get, loading } = useConfiguration(filters);
  const signatory = (key: string): POSignatory | null => {
    const raw = get(CATEGORY, key);
    const name = typeof raw === "string" ? raw.trim() : "";
    return name ? { name, designation: ROLE[key].designation } : null;
  };
  return {
    approvedBy: signatory("po_approving_name"),
    bacSecretary: signatory("po_bac_secretary_name"),
    loading,
  };
}
