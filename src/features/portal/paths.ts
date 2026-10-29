/**
 * Where the public portal lives (22 Oct 2026). The admin app serves it under
 * /portal; the public portal build (VITE_APP_SURFACE=portal, deployed to
 * egso-public-portal.web.app) serves it at the root. Every portal link goes
 * through portalPath so it works on both.
 */
export const PORTAL_ONLY = import.meta.env.VITE_APP_SURFACE === "portal";

const BASE = PORTAL_ONLY ? "" : "/portal";

/** portalPath() is the portal's home; portalPath("/track") one of its pages. */
export function portalPath(page: "" | `/${string}` = ""): string {
  return BASE + page || "/";
}

/** True on any portal page: always on the portal site, under /portal in the admin app. */
export function isPortalPath(pathname: string): boolean {
  return PORTAL_ONLY || pathname === BASE || pathname.startsWith(`${BASE}/`);
}

/** True on the portal's home page. */
export function isPortalHome(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === BASE;
}
