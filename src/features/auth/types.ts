/** Authentication & authorization domain types. */

export type Role = "Administrator" | "Department User" | "Viewer";

export const ROLES: Role[] = ["Administrator", "Department User", "Viewer"];

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  office: string;
  /**
   * The Supabase fallback's approver flag. On Firebase every account is an
   * Administrator (29 Oct 2026), so it is always false there.
   */
  approver?: boolean;
}

/** Fine-grained permissions the UI can guard on. */
export type Permission =
  | "view:dashboard"
  | "manage:purchase-requests"
  | "approve:purchase-requests"
  | "manage:purchase-orders"
  | "manage:ris"
  | "manage:inventory"
  | "manage:reservations"
  | "manage:records"
  | "view:reports"
  | "view:audit"
  | "manage:settings";

/**
 * Role → permission matrix. Mirrors firestore.rules, which is what actually
 * enforces it: these grants only decide what the screens offer.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[] | "*"> = {
  Administrator: "*",
  "Department User": [
    "view:dashboard",
    "manage:purchase-requests",
    "manage:ris",
    "manage:reservations",
  ],
  Viewer: ["view:dashboard", "view:reports"],
};

/** True when the user's role grants the permission. */
export function can(user: AuthUser | null, permission: Permission): boolean {
  if (!user) return false;
  // Approving is granted per person, not per role.
  if (permission === "approve:purchase-requests") {
    return user.role === "Administrator" || (user.role === "Department User" && user.approver === true);
  }
  const grants = ROLE_PERMISSIONS[user.role];
  return grants === "*" || grants.includes(permission);
}

/**
 * Whether the user may edit, submit or void this purchase request: deciders
 * may act on any, a Department User only on the requests they raised.
 * Requests filed on the public portal have no owner, so only deciders act on
 * them. Matches canEditPR() in firestore.rules.
 */
export function canEditPurchaseRequest(
  user: AuthUser | null,
  pr: { createdByUid?: string },
): boolean {
  if (can(user, "approve:purchase-requests")) return true;
  return !!user && user.role === "Department User" && !!pr.createdByUid && pr.createdByUid === user.id;
}
