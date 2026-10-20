import { getAuth } from "firebase-admin/auth";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { beforeUserCreated } from "firebase-functions/v2/identity";

/**
 * Staff accounts.
 *
 * requireOfficeEmail ports the Postgres trigger enforce_office_domain
 * (migration 036): every account must use an office address. It is a
 * blocking function, which needs Firebase Authentication upgraded to
 * Identity Platform (free tier) before it can be deployed.
 *
 * setStaffRole is how an Administrator gives someone a role. The role lives
 * in a custom claim that only the Admin SDK can write, so firestore.rules and
 * storage.rules can trust it; the browser's user_metadata could not be.
 */

export const OFFICE_DOMAINS = ["alaminos.gov.ph"];

export const ROLES = ["Administrator", "Department User", "Viewer"] as const;
export type Role = (typeof ROLES)[number];

export function isOfficeEmail(email: string | undefined | null): boolean {
  const domain = (email ?? "").toLowerCase().split("@")[1] ?? "";
  return OFFICE_DOMAINS.includes(domain);
}

export const requireOfficeEmail = beforeUserCreated((event) => {
  const email = event.data?.email;
  if (!isOfficeEmail(email)) {
    throw new HttpsError(
      "permission-denied",
      `Accounts on this system are issued by the General Services Office. ${email ?? "(no email)"} is not an office address.`,
    );
  }
});

export const setStaffRole = onCall(async (request) => {
  if (request.auth?.token.role !== "Administrator") {
    throw new HttpsError("permission-denied", "Only an Administrator can assign roles.");
  }
  const { uid, role, approver } = (request.data ?? {}) as {
    uid?: unknown;
    role?: unknown;
    approver?: unknown;
  };
  if (typeof uid !== "string" || !uid) {
    throw new HttpsError("invalid-argument", "Choose the account to change.");
  }
  if (role !== null && !ROLES.includes(role as Role)) {
    throw new HttpsError("invalid-argument", `Role must be one of ${ROLES.join(", ")}, or null.`);
  }
  if (approver !== undefined && typeof approver !== "boolean") {
    throw new HttpsError("invalid-argument", "Approver must be true or false.");
  }
  // Approving purchase requests is the Administrator's, or a Department
  // User's explicitly granted here. A Viewer stays read-only.
  if (approver === true && role !== "Department User") {
    throw new HttpsError(
      "invalid-argument",
      role === "Administrator"
        ? "Administrators already approve; no separate approver grant is needed."
        : "Only a Department User can be made an approver.",
    );
  }
  if (uid === request.auth.uid && role !== "Administrator") {
    throw new HttpsError("failed-precondition", "You cannot remove your own Administrator role.");
  }

  const auth = getAuth();
  const user = await auth.getUser(uid);
  if (!isOfficeEmail(user.email)) {
    throw new HttpsError("failed-precondition", "Only office accounts can be given a role.");
  }
  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims ?? {}),
    role: role ?? null,
    approver: approver === true,
  });
  // Signed-in sessions pick the new role up on their next token refresh.
  await auth.revokeRefreshTokens(uid);
  return { uid, role, approver: approver === true };
});
