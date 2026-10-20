import { createHash } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

import { ROLES, type Role } from "../accounts.js";

/**
 * Who is calling a function. The role comes only from the custom claim the
 * Admin SDK sets (setStaffRole); a signed-in account without one is treated
 * like any member of the public.
 */
export type Caller =
  | { kind: "staff"; role: Role; uid: string; email: string; approver: boolean }
  | { kind: "public" };

export function callerOf(request: CallableRequest): Caller {
  const token = request.auth?.token;
  const role = token?.role;
  if (request.auth && typeof role === "string" && (ROLES as readonly string[]).includes(role)) {
    return {
      kind: "staff",
      role: role as Role,
      uid: request.auth.uid,
      email: String(token?.email ?? ""),
      approver: token?.approver === true,
    };
  }
  return { kind: "public" };
}

/** Administrators and Department Users may create records; Viewers read only. */
export function canCreate(caller: Caller): boolean {
  return caller.kind === "staff" && (caller.role === "Administrator" || caller.role === "Department User");
}

export function requireRole(caller: Caller, roles: readonly Role[], action: string): void {
  if (caller.kind !== "staff" || !roles.includes(caller.role)) {
    throw new HttpsError("permission-denied", `You don't have permission to ${action}.`);
  }
}

/**
 * App Check for the functions the public portal calls. When enforced, a call
 * must carry an App Check token proving it comes from the real GSO PRIMS web
 * app, not a script. Off by default — the emulators issue no tokens — and
 * switched on in production with ENFORCE_APP_CHECK=true in functions/.env
 * once the web app is registered for App Check (see docs/firebase/README.md).
 */
export const PUBLIC_CALLABLE = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === "true" } as const;

/**
 * Public calls allowed per network address per hour, by function. The
 * municipal hall may reach the portal through one shared address, so these
 * are set for a busy office, not one person.
 */
export const PUBLIC_LIMITS = {
  submit: 60,
  suggest: 1200,
} as const;

/**
 * Counts public calls per hashed network address and hour in
 * rate_limits/{hash}-{hour}; browsers have no access to that collection.
 * The address itself is never stored.
 */
export async function enforcePublicLimit(
  request: CallableRequest,
  bucket: keyof typeof PUBLIC_LIMITS,
): Promise<void> {
  const address = request.rawRequest?.ip ?? "unknown";
  const hour = new Date().toISOString().slice(0, 13);
  const key = createHash("sha256").update(`${bucket}|${address}`).digest("hex").slice(0, 24);
  const db = getFirestore();
  const ref = db.doc(`rate_limits/${key}-${hour.replace(/[^0-9]/g, "")}`);
  const count = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = Number(snap.get("count") ?? 0) + 1;
    tx.set(ref, {
      bucket,
      hour,
      count: next,
      // For a Firestore TTL policy on this field (set up with the project).
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });
    return next;
  });
  if (count > PUBLIC_LIMITS[bucket]) {
    throw new HttpsError(
      "resource-exhausted",
      "Too many requests from this network. Please try again within the hour.",
    );
  }
}
