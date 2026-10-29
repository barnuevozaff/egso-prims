import { createBrowserRouter } from "react-router-dom";

import { PortalLayout } from "@/layouts/portal-layout";
import { RouteError } from "@/components/feedback/route-error";
import { portalRoutes } from "@/portal-routes";

/**
 * The public portal site (egso-public-portal.web.app, 22 Oct 2026): the
 * portal's pages at the root and nothing else. No admin page, sign-in screen
 * or guard is part of this build; staff use egso-b2c0a.web.app. What the
 * portal may read or file is still decided by firestore.rules and the Cloud
 * Functions, whichever site the request comes from.
 */
export const router = createBrowserRouter([
  { element: <PortalLayout />, errorElement: <RouteError />, children: portalRoutes },
  { path: "*", element: <RouteError notFound /> },
]);
