import * as React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppLayout } from "@/layouts/app-layout";
import { PortalLayout } from "@/layouts/portal-layout";
import { PermissionRoute, ProtectedRoute } from "@/features/auth/components/guards";
import { RouteError } from "@/components/feedback/route-error";

/**
 * Routes are code-split.
 *
 * Every page used to be a static import, so one bundle carried all 33 of them:
 * a staff member opening /portal/track to check a reference number downloaded
 * the fuel dashboard, the audit trail, Chart.js and all five wizards first. On
 * a municipal-hall connection that is the difference between usable and
 * abandoned.
 *
 * `React.lazy` splits each route into its own chunk, fetched when the route is
 * first visited. The pattern is not new here — smart-import already imports
 * Tesseract and pdf.js dynamically, which is why those sit in their own files
 * in dist/. This applies the same idea one level up.
 *
 * The two layouts and the auth guard stay static: they are on every path, so
 * splitting them would only add a round trip.
 */

/*
 * A deployment gives every chunk a new hashed filename and drops the old one.
 * A tab that loaded index.html before the deployment went out asks for a file
 * that is no longer on the server, and the route it was opening never
 * resolves: the page sits on "Loading…" for ever with nothing in the console.
 * One reload fetches the new index.html and the route opens.
 *
 * The flag stops a build that is genuinely broken from reloading in a loop —
 * the second failure is allowed through to the error boundary, which says so.
 * sessionStorage is unavailable in some browser configurations; without it we
 * simply lose the loop guard, so its absence must not break the page.
 */
const CHUNK_RELOAD_KEY = "gso-prims:chunk-reload";

const hasReloaded = (): boolean => {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_KEY) !== null;
  } catch {
    return false;
  }
};

const setReloaded = (value: boolean): void => {
  try {
    if (value) sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    else sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    /* no loop guard, but the page still works */
  }
};

const lazyPage = <K extends string>(
  loader: () => Promise<Record<K, React.ComponentType>>,
  key: K,
) =>
  React.lazy(async () => {
    try {
      const mod = await loader();
      setReloaded(false);
      return { default: mod[key] };
    } catch (error) {
      if (hasReloaded()) throw error;
      setReloaded(true);
      window.location.reload();
      // The reload takes over; nothing after this point renders.
      return new Promise<never>(() => {});
    }
  });

const LoginPage = lazyPage(() => import("@/pages/auth/login-page"), "LoginPage");

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

const DashboardPage = lazyPage(() => import("@/pages/dashboard/dashboard-page"), "DashboardPage");
const PRListPage = lazyPage(() => import("@/pages/purchase-requests/pr-list-page"), "PRListPage");
const PRCreatePage = lazyPage(
  () => import("@/pages/purchase-requests/pr-create-page"),
  "PRCreatePage",
);
const PRDetailPage = lazyPage(
  () => import("@/pages/purchase-requests/pr-detail-page"),
  "PRDetailPage",
);
const PREditPage = lazyPage(() => import("@/pages/purchase-requests/pr-edit-page"), "PREditPage");
const POListPage = lazyPage(() => import("@/pages/purchase-orders/po-list-page"), "POListPage");
const POCreatePage = lazyPage(
  () => import("@/pages/purchase-orders/po-create-page"),
  "POCreatePage",
);
const POEditPage = lazyPage(() => import("@/pages/purchase-orders/po-edit-page"), "POEditPage");
const RISListPage = lazyPage(() => import("@/pages/ris/ris-list-page"), "RISListPage");
const RISCreatePage = lazyPage(() => import("@/pages/ris/ris-create-page"), "RISCreatePage");
const RISEditPage = lazyPage(() => import("@/pages/ris/ris-edit-page"), "RISEditPage");
const InventoryListPage = lazyPage(
  () => import("@/pages/inventory/inventory-list-page"),
  "InventoryListPage",
);
const InventoryCreatePage = lazyPage(
  () => import("@/pages/inventory/inventory-create-page"),
  "InventoryCreatePage",
);
const InventoryEditPage = lazyPage(
  () => import("@/pages/inventory/inventory-edit-page"),
  "InventoryEditPage",
);
const ResListPage = lazyPage(() => import("@/pages/reservations/res-list-page"), "ResListPage");
const ResCreatePage = lazyPage(
  () => import("@/pages/reservations/res-create-page"),
  "ResCreatePage",
);
const ResEditPage = lazyPage(() => import("@/pages/reservations/res-edit-page"), "ResEditPage");
const ViolationListPage = lazyPage(
  () => import("@/pages/violations/violation-list-page"),
  "ViolationListPage",
);
const ReportsPage = lazyPage(() => import("@/pages/reports/reports-page"), "ReportsPage");
const AuditListPage = lazyPage(() => import("@/pages/audit/audit-list-page"), "AuditListPage");
const SettingsPage = lazyPage(() => import("@/pages/settings/settings-page"), "SettingsPage");
const EnergyDashboardPage = lazyPage(
  () => import("@/pages/energy/energy-dashboard-page"),
  "EnergyDashboardPage",
);
const EnergySummaryPage = lazyPage(
  () => import("@/pages/energy/energy-summary-page"),
  "EnergySummaryPage",
);
const WaterDashboardPage = lazyPage(
  () => import("@/pages/water/water-dashboard-page"),
  "WaterDashboardPage",
);
const WaterSummaryPage = lazyPage(
  () => import("@/pages/water/water-summary-page"),
  "WaterSummaryPage",
);
const FuelDashboardPage = lazyPage(
  () => import("@/pages/fuel/fuel-dashboard-page"),
  "FuelDashboardPage",
);
const FuelSummaryPage = lazyPage(
  () => import("@/pages/fuel/fuel-summary-page"),
  "FuelSummaryPage",
);
const RecordsListPage = lazyPage(
  () => import("@/pages/records/records-list-page"),
  "RecordsListPage",
);
const RecordsCreatePage = lazyPage(
  () => import("@/pages/records/records-create-page"),
  "RecordsCreatePage",
);
const RecordsDetailPage = lazyPage(
  () => import("@/pages/records/records-detail-page"),
  "RecordsDetailPage",
);
const RecordsEditPage = lazyPage(
  () => import("@/pages/records/records-edit-page"),
  "RecordsEditPage",
);
// Named for the records module, not the stock one: "Inventory" alone already
// belongs to the storeroom pages above.
const RecordsInventoryListPage = lazyPage(
  () => import("@/pages/records/inventory-list-page"),
  "InventoryListPage",
);
const RecordsInventoryCreatePage = lazyPage(
  () => import("@/pages/records/inventory-create-page"),
  "InventoryCreatePage",
);
const RecordsInventoryDetailPage = lazyPage(
  () => import("@/pages/records/inventory-detail-page"),
  "InventoryDetailPage",
);
const RecordsInventoryEditPage = lazyPage(
  () => import("@/pages/records/inventory-edit-page"),
  "InventoryEditPage",
);
const DisposalListPage = lazyPage(
  () => import("@/pages/records/disposal-list-page"),
  "DisposalListPage",
);
const DisposalCreatePage = lazyPage(
  () => import("@/pages/records/disposal-create-page"),
  "DisposalCreatePage",
);
const DisposalDetailPage = lazyPage(
  () => import("@/pages/records/disposal-detail-page"),
  "DisposalDetailPage",
);
const DisposalEditPage = lazyPage(
  () => import("@/pages/records/disposal-edit-page"),
  "DisposalEditPage",
);
const ShelfMapPage = lazyPage(() => import("@/pages/records/shelf-map-page"), "ShelfMapPage");

export const router = createBrowserRouter([
  { path: "login", element: <LoginPage />, errorElement: <RouteError /> },
  {
    path: "portal",
    element: <PortalLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <PortalHome /> },
      { path: "request", element: <PortalRequestPage /> },
      { path: "ris", element: <PortalRISPage /> },
      { path: "reserve", element: <PortalReservePage /> },
      { path: "track", element: <PortalTrackPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppLayout />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "purchase-requests", element: <PRListPage /> },
          { path: "purchase-requests/new", element: <PermissionRoute permission="manage:purchase-requests"><PRCreatePage /></PermissionRoute> },
          { path: "purchase-requests/:id", element: <PRDetailPage /> },
          { path: "purchase-requests/:id/edit", element: <PermissionRoute permission="manage:purchase-requests"><PREditPage /></PermissionRoute> },
          { path: "purchase-orders", element: <POListPage /> },
          { path: "purchase-orders/new", element: <PermissionRoute permission="manage:purchase-orders"><POCreatePage /></PermissionRoute> },
          { path: "purchase-orders/:id/edit", element: <PermissionRoute permission="manage:purchase-orders"><POEditPage /></PermissionRoute> },
          { path: "ris", element: <RISListPage /> },
          { path: "ris/new", element: <PermissionRoute permission="manage:ris"><RISCreatePage /></PermissionRoute> },
          { path: "ris/:id/edit", element: <PermissionRoute permission="manage:ris"><RISEditPage /></PermissionRoute> },
          { path: "inventory", element: <InventoryListPage /> },
          { path: "inventory/new", element: <PermissionRoute permission="manage:inventory"><InventoryCreatePage /></PermissionRoute> },
          { path: "inventory/:id/edit", element: <PermissionRoute permission="manage:inventory"><InventoryEditPage /></PermissionRoute> },
          { path: "reservations", element: <ResListPage /> },
          { path: "reservations/new", element: <PermissionRoute permission="manage:reservations"><ResCreatePage /></PermissionRoute> },
          { path: "reservations/:id/edit", element: <PermissionRoute permission="manage:reservations"><ResEditPage /></PermissionRoute> },
          { path: "violations", element: <ViolationListPage /> },
          { path: "energy", element: <EnergyDashboardPage /> },
          { path: "energy/summary", element: <EnergySummaryPage /> },
          // Retired: the detailed energy report now lives in the Reports module.
          { path: "energy/report", element: <Navigate to="/energy" replace /> },
          { path: "water", element: <WaterDashboardPage /> },
          { path: "water/summary", element: <WaterSummaryPage /> },
          { path: "fuel", element: <FuelDashboardPage /> },
          { path: "fuel/summary", element: <FuelSummaryPage /> },
          { path: "records", element: <RecordsListPage /> },
          { path: "records/new", element: <PermissionRoute permission="manage:records"><RecordsCreatePage /></PermissionRoute> },
          // Declared before "records/:id" so the static segment is unmistakable:
          // an inventory route must never be read as a schedule id.
          { path: "records/shelves", element: <ShelfMapPage /> },
          { path: "records/inventory", element: <RecordsInventoryListPage /> },
          { path: "records/inventory/new", element: <PermissionRoute permission="manage:records"><RecordsInventoryCreatePage /></PermissionRoute> },
          { path: "records/inventory/:id", element: <RecordsInventoryDetailPage /> },
          { path: "records/inventory/:id/edit", element: <PermissionRoute permission="manage:records"><RecordsInventoryEditPage /></PermissionRoute> },
          { path: "records/disposal", element: <DisposalListPage /> },
          { path: "records/disposal/new", element: <PermissionRoute permission="manage:records"><DisposalCreatePage /></PermissionRoute> },
          { path: "records/disposal/:id", element: <DisposalDetailPage /> },
          { path: "records/disposal/:id/edit", element: <PermissionRoute permission="manage:records"><DisposalEditPage /></PermissionRoute> },
          { path: "records/:id", element: <RecordsDetailPage /> },
          { path: "records/:id/edit", element: <PermissionRoute permission="manage:records"><RecordsEditPage /></PermissionRoute> },
          { path: "reports", element: <PermissionRoute permission="view:reports"><ReportsPage /></PermissionRoute> },
          { path: "audit", element: <PermissionRoute permission="view:audit"><AuditListPage /></PermissionRoute> },
          { path: "settings", element: <PermissionRoute permission="manage:settings"><SettingsPage /></PermissionRoute> },
        ],
      },
    ],
  },
  // Anything else. Without this a mistyped or stale URL matched nothing and
  // rendered an empty document.
  { path: "*", element: <RouteError notFound /> },
]);
