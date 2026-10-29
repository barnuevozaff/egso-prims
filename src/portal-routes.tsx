import type { RouteObject } from "react-router-dom";

import { lazyPage } from "@/lib/lazy-page";

/**
 * The public portal's pages, shared by both builds (22 Oct 2026): the admin
 * app mounts them under /portal, the public portal site
 * (egso-public-portal.web.app, src/portal-router.tsx) at its root. Nothing
 * here imports an admin page, so the portal build carries none.
 */

const PortalHome = lazyPage(() => import("@/pages/portal/portal-home"), "PortalHome");
const PortalRequestPage = lazyPage(
  () => import("@/pages/portal/portal-request-page"),
  "PortalRequestPage",
);
const PortalRISPage = lazyPage(() => import("@/pages/portal/portal-ris-page"), "PortalRISPage");
const PortalReservePage = lazyPage(
  () => import("@/pages/portal/portal-reserve-page"),
  "PortalReservePage",
);
const PortalTrackPage = lazyPage(
  () => import("@/pages/portal/portal-track-page"),
  "PortalTrackPage",
);

export const portalRoutes: RouteObject[] = [
  { index: true, element: <PortalHome /> },
  { path: "request", element: <PortalRequestPage /> },
  { path: "ris", element: <PortalRISPage /> },
  { path: "reserve", element: <PortalReservePage /> },
  { path: "track", element: <PortalTrackPage /> },
];
