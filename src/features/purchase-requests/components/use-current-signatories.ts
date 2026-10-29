import * as React from "react";

import { useConfiguration } from "@/features/config/hooks";
import { SIGNATORY_ROLES } from "@/features/config/types";
import type { PRSignatory } from "@/features/purchase-requests/types";

/**
 * Settings → Purchase Request signatories now, for a request not yet approved
 * (a draft preview). The roles and designations are the form's (fixed); only
 * the names come from Settings (21 Oct 2026).
 */
export interface CurrentSignatories {
  /** The General Services Officer — not the employee who filed the request. */
  requestedBy: PRSignatory | null;
  cash: PRSignatory | null;
  approved: PRSignatory | null;
  /** True until Settings has answered: a document printed before then would show none. */
  loading: boolean;
}

const CATEGORY = "Signatories";
const ROLE = Object.fromEntries(SIGNATORY_ROLES.Signatories.map((r) => [r.key, r]));

export function useCurrentSignatories(): CurrentSignatories {
  const filters = React.useMemo(() => ({ category: CATEGORY }), []);
  const { get, loading } = useConfiguration(filters);
  const signatory = (key: string): PRSignatory | null => {
    const raw = get(CATEGORY, key);
    const name = typeof raw === "string" ? raw.trim() : "";
    return name ? { name, designation: ROLE[key].designation } : null;
  };
  return {
    requestedBy: signatory("pr_requested_by_name"),
    cash: signatory("pr_cash_availability_name"),
    approved: signatory("pr_approved_by_name"),
    loading,
  };
}
