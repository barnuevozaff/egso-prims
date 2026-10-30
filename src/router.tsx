import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppLayout } from "@/layouts/app-layout";
import { PortalLayout } from "@/layouts/portal-layout";
import { PermissionRoute, ProtectedRoute } from "@/features/auth/components/guards";
import { RouteError } from "@/components/feedback/route-error";
import { lazyPage } from "@/lib/lazy-page";
import { portalRoutes } from "@/portal-routes";
import { ShelvesRedirect } from "@/pages/records/shelves-redirect";

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

const LoginPage = lazyPage(() => import("@/pages/auth/login-page"), "LoginPage");

const DashboardPage = lazyPage(() => import("@/pages/dashboard/dashboard-page"), "DashboardPage");
const PRListPage = lazyPage(() => import("@/pages/purchase-requests/pr-list-page"), "PRListPage");
const PRCreatePage = lazyPage(
  () => import("@/pages/purchase-requests/pr-create-page"),
  "PRCreatePage",
);
const PRPage = lazyPage(() => import("@/pages/purchase-requests/pr-page"), "PRPage");
const POListPage = lazyPage(() => import("@/pages/purchase-orders/po-list-page"), "POListPage");
// One page per order (21 Oct 2026): orders are created when their request is
// approved, so there is no "new order" form; details are completed here.
const POPage = lazyPage(() => import("@/pages/purchase-orders/po-page"), "POPage");
const RISListPage = lazyPage(() => import("@/pages/ris/ris-list-page"), "RISListPage");
const RISCreatePage = lazyPage(() => import("@/pages/ris/ris-create-page"), "RISCreatePage");
const RISPage = lazyPage(() => import("@/pages/ris/ris-page"), "RISPage");
const InventoryListPage = lazyPage(
  () => import("@/pages/inventory/inventory-list-page"),
  "InventoryListPage",
);
const InventoryCreatePage = lazyPage(
  () => import("@/pages/inventory/inventory-create-page"),
  "InventoryCreatePage",
);
const InventoryImportPage = lazyPage(
  () => import("@/pages/inventory/inventory-import-page"),
  "InventoryImportPage",
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
const ResPage = lazyPage(() => import("@/pages/reservations/res-page"), "ResPage");
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
const RecordsRoomPage = lazyPage(() => import("@/pages/records/records-room-page"), "RecordsRoomPage");

export const router = createBrowserRouter([
  { path: "login", element: <LoginPage />, errorElement: <RouteError /> },
  {
    path: "portal",
    element: <PortalLayout />,
    errorElement: <RouteError />,
    children: portalRoutes,
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
          // A request opens on its own page, ready to edit while it can be (30 Oct 2026).
          { path: "purchase-requests/:id", element: <PRPage /> },
          { path: "purchase-requests/:id/edit", element: <PRPage /> },
          { path: "purchase-orders", element: <POListPage /> },
          { path: "purchase-orders/new", element: <Navigate to="/purchase-orders" replace /> },
          { path: "purchase-orders/:id", element: <POPage /> },
          { path: "purchase-orders/:id/edit", element: <POPage /> },
          { path: "ris", element: <RISListPage /> },
          { path: "ris/new", element: <PermissionRoute permission="manage:ris"><RISCreatePage /></PermissionRoute> },
          // A slip opens on its own page, ready to edit while it can be (30 Oct 2026).
          { path: "ris/:id", element: <RISPage /> },
          { path: "ris/:id/edit", element: <RISPage /> },
          { path: "inventory", element: <InventoryListPage /> },
          { path: "inventory/new", element: <PermissionRoute permission="manage:inventory"><InventoryCreatePage /></PermissionRoute> },
          { path: "inventory/import", element: <PermissionRoute permission="manage:inventory"><InventoryImportPage /></PermissionRoute> },
          { path: "inventory/:id/edit", element: <PermissionRoute permission="manage:inventory"><InventoryEditPage /></PermissionRoute> },
          { path: "reservations", element: <ResListPage /> },
          { path: "reservations/new", element: <PermissionRoute permission="manage:reservations"><ResCreatePage /></PermissionRoute> },
          // A reservation opens on its own page, ready to edit while it can be (30 Oct 2026).
          { path: "reservations/:id", element: <ResPage /> },
          { path: "reservations/:id/edit", element: <ResPage /> },
          { path: "violations", element: <ViolationListPage /> },
          { path: "energy", element: <EnergyDashboardPage /> },
          { path: "energy/summary", element: <EnergySummaryPage /> },
          // Retired: the detailed energy report now lives in the Reports module.
          { path: "energy/report", element: <Navigate to="/energy" replace /> },
          { path: "water", element: <WaterDashboardPage /> },
          { path: "water/summary", element: <WaterSummaryPage /> },
          { path: "fuel", element: <FuelDashboardPage /> },
          { path: "fuel/summary", element: <FuelSummaryPage /> },
          // One Records Room for the three forms (30 Oct 2026); each register is a view of it.
          { path: "records", element: <RecordsRoomPage /> },
          { path: "records/schedules", element: <RecordsListPage /> },
          { path: "records/new", element: <PermissionRoute permission="manage:records"><RecordsCreatePage /></PermissionRoute> },
          // Declared before "records/:id" so the static segment is unmistakable:
          // an inventory route must never be read as a schedule id.
          { path: "records/shelves", element: <ShelvesRedirect /> },
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
