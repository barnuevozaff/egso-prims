import * as React from "react";
import { AnimatePresence } from "motion/react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  FileCheck2,
  FileText,
  Fuel,
  History,
  LayoutDashboard,
  LogOut,
  Package,
  ScrollText,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Zap,
} from "lucide-react";

// By path rather than through the barrel — see main.tsx. The app shell is on
// every authenticated route, so whatever it reaches is in the entry chunk.
import { AppShell } from "@/components/layout/app-shell";
import { PageFallback } from "@/components/feedback/page-fallback";
import { Breadcrumb, type BreadcrumbItem } from "@/components/navigation/breadcrumb";
import { ProfileMenu } from "@/components/navigation/profile-menu";
import { NotificationBell, TopBar } from "@/components/navigation/top-bar";
import {
  Sidebar,
  SidebarBrand,
  SidebarContent,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
} from "@/components/navigation/sidebar";
import { ConfirmationModal } from "@/components/modal/modals";
import { toast } from "@/components/feedback/toaster";
import { useAuth } from "@/features/auth/auth-context";
import { can, type Permission } from "@/features/auth/types";
import { initialsOf } from "@/lib/initials";
import { useNotifications } from "@/features/notifications/hooks";
import { NotificationDrawer } from "@/features/notifications/components/notification-drawer";
import { useAppearanceSync, useBranding } from "@/features/config/use-appearance";
import { useNavCounts, type NavCounts } from "@/features/shared/use-nav-counts";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

interface ModuleNavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** Route path; items without a path are future modules. */
  to?: string;
  badge?: { text: string; color: "blue" | "green" | "orange" };
  dot?: "orange" | "green" | "red";
  /**
   * Which live count fills this item's badge. Items without one never carry a
   * badge — there are no hardcoded counts left in this file.
   */
  countKey?: keyof NavCounts;
  badgeColor?: "blue" | "green" | "orange";
  /** Show the count as a presence dot rather than a number. */
  countAsDot?: boolean;
  /**
   * Shown only to roles granted this permission. The route keeps its own
   * guard (PermissionRoute), and firestore.rules decide what data is
   * actually readable; hiding the link only spares people a dead end.
   */
  permission?: Permission;
}

// Single top-level modules (unchanged — remain plain nav items).
const dashboardItem: ModuleNavItem = { icon: LayoutDashboard, label: "Dashboard", to: "/" };
const inventoryItem: ModuleNavItem = {
  icon: Package,
  label: "Inventory",
  to: "/inventory",
  countKey: "stockAlerts",
  badgeColor: "orange",
};
// Slips issue from stock, so the RIS sits beside Inventory rather than inside
// Procurement: request → order → stock → issue, top to bottom.
const risItem: ModuleNavItem = { icon: ClipboardList, label: "Requisition & issue slips", to: "/ris" };
const reservationItem: ModuleNavItem = {
  icon: CalendarDays,
  label: "Facility reservations",
  to: "/reservations",
  countKey: "pendingReservations",
  badgeColor: "green",
};
// Tickets for breaches of municipal ordinances: illegal parking, obstruction,
// vending and the like. "Ordinance Violation Receipt" is the usual LGU name.
const violationItem: ModuleNavItem = {
  icon: ShieldAlert,
  label: "Ordinance violations",
  to: "/violations",
};
const reportsItem: ModuleNavItem = { icon: BarChart3, label: "Reports", to: "/reports", permission: "view:reports" };

// The two collapsible groups. Children keep their existing icons/badges/dots.
const procurementChildren: ModuleNavItem[] = [
  {
    icon: FileText,
    label: "Purchase requests",
    to: "/purchase-requests",
    countKey: "pendingPRs",
    badgeColor: "blue",
  },
  {
    icon: ShoppingCart,
    label: "Purchase orders",
    to: "/purchase-orders",
    countKey: "pendingPOs",
  },
];
const utilitiesChildren: ModuleNavItem[] = [
  { icon: Zap, label: "Energy", to: "/energy" },
  { icon: Droplets, label: "Water", to: "/water" },
  { icon: Fuel, label: "Fuel", to: "/fuel" },
];
// The two National Archives forms the office files. Each is named for what it
// is rather than standing in for the whole module.
const recordsChildren: ModuleNavItem[] = [
  { icon: ScrollText, label: "Disposition schedule", to: "/records" },
  { icon: ClipboardCheck, label: "Inventory and appraisal", to: "/records/inventory" },
  { icon: FileCheck2, label: "Authority to dispose", to: "/records/disposal" },
];

/* ---- Rail width (icon-only or full), persisted on this computer ---- */

const SIDEBAR_COLLAPSED_KEY = "gso-prims.sidebar-collapsed";

/** Last persisted collapsed state (default expanded). */
function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * The rail, top to bottom, in the order work moves: request, order, stock,
 * issue; then the services the office runs, the meters it reads, its records.
 * Every section is open; the groups used to start shut, so reaching Inventory
 * or Fuel took a click on a heading first.
 */
const NAV_SECTIONS: { label?: string; items: ModuleNavItem[] }[] = [
  { items: [dashboardItem] },
  { label: "Procurement", items: procurementChildren },
  { label: "Supply", items: [inventoryItem, risItem] },
  { label: "Services", items: [reservationItem, violationItem] },
  { label: "Utilities", items: utilitiesChildren },
  { label: "Records", items: recordsChildren },
  { items: [reportsItem] },
];

const systemNav: (ModuleNavItem & { trailing?: React.ReactNode })[] = [
  { icon: History, label: "Audit trail", to: "/audit", permission: "view:audit" },
  { icon: Settings, label: "Settings", to: "/settings", permission: "manage:settings" },
];

/** Every path the sidebar leads to, so an item can tell when a deeper one owns
 *  the page. Declared here because the last of the item lists is above it. */
const NAV_PATHS: string[] = [...NAV_SECTIONS.flatMap((sec) => sec.items), ...systemNav]
  .map((item) => item.to)
  .filter((to): to is string => Boolean(to));

/**
 * Whether a sidebar item leads to the page on screen.
 *
 * An item owns a path when the path is inside it AND no other item sits deeper
 * on the same path. Records Management nests — /records, /records/inventory and
 * /records/disposal are three items, not one with two children — so the plain
 * prefix test this used to be lit "Records Disposition Schedule" on all three
 * of them, and the group showed two items open at once.
 */
function isActive(pathname: string, to?: string) {
  if (!to) return false;
  if (to === "/") return pathname === "/";
  if (pathname !== to && !pathname.startsWith(`${to}/`)) return false;
  return !NAV_PATHS.some(
    (deeper) =>
      deeper.startsWith(`${to}/`) &&
      (pathname === deeper || pathname.startsWith(`${deeper}/`)),
  );
}

/**
 * Resolves an item's live count into a badge or a dot, and strips the count
 * fields so they never reach `SidebarItem`. A count of zero yields neither —
 * an empty queue should read as quiet, not as a `0` to decode.
 */
function withCount(item: ModuleNavItem, counts: NavCounts): ModuleNavItem {
  const { countKey, badgeColor, countAsDot, permission: _permission, ...rest } = item;
  if (!countKey) return rest;
  const value = counts[countKey];
  if (value <= 0) return rest;
  return countAsDot
    ? { ...rest, dot: "orange" }
    : { ...rest, badge: { text: String(value), color: badgeColor ?? "blue" } };
}

function AppSidebar({
  collapsed,
  className,
  onNavigate,
}: {
  collapsed: boolean;
  /** Overrides the rail's `hidden md:flex` when rendered inside the mobile drawer. */
  className?: string;
  /** Called after any navigation, so the mobile drawer can close itself. */
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const branding = useBranding();
  const counts = useNavCounts();
  const { user } = useAuth();
  const allowed = (item: ModuleNavItem) => !item.permission || can(user, item.permission);
  const sections = NAV_SECTIONS.map((sec) => ({ ...sec, items: sec.items.filter(allowed) })).filter(
    (sec) => sec.items.length > 0,
  );
  const system = systemNav.filter(allowed);

  /** Navigates, then lets the mobile drawer close itself behind the new route. */
  const go = React.useCallback(
    (to: string) => {
      navigate(to);
      onNavigate?.();
    },
    [navigate, onNavigate],
  );

  const renderItem = (navItem: ModuleNavItem) => {
    const { to, ...item } = withCount(navItem, counts);
    return (
      <SidebarItem
        key={item.label}
        {...item}
        active={isActive(pathname, to)}
        onClick={to ? () => go(to) : undefined}
      />
    );
  };
  return (
    <Sidebar collapsed={collapsed} className={className}>
      <SidebarBrand
        icon={Building2}
        logo={branding.logo}
        title="General Services Office"
        subtitle={branding.organizationName}
      />
      <SidebarContent>
        {sections.map((sec, i) => (
          <SidebarGroup key={sec.label ?? `top-${i}`} label={sec.label}>
            {sec.items.map(renderItem)}
          </SidebarGroup>
        ))}
        {system.length > 0 && (
          <>
            <SidebarDivider />
            <SidebarGroup>
              {system.map(({ to, permission: _permission, ...item }) => (
                <SidebarItem
                  key={item.label}
                  {...item}
                  active={isActive(pathname, to)}
                  onClick={to ? () => go(to) : undefined}
                />
              ))}
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      {/* No account block here: Settings is in the list above and Sign Out
          is in the profile menu at the top right, where it was a third copy. */}
    </Sidebar>
  );
}

/**
 * A record's id in the URL is a database key, not something to put in front of
 * a clerk: the trail read "Authority to Dispose of Records ›
 * 4e78e5a8-14af-46c5-b1dd-612adde44872", and the edit page read "Edit
 * 4e78e5a8-…". The page heading underneath already carries the document number
 * the office files by, so the trail ends at the section instead.
 */
const isRecordId = (segment: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);

/** Derives the breadcrumb trail from the current route. */
function useBreadcrumbs(): BreadcrumbItem[] {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // No office crumb: the sidebar already names the office on every page.
  const crumbs: BreadcrumbItem[] = [];

  if (pathname === "/") {
    crumbs.push({ label: "Dashboard" });
    return crumbs;
  }

  const sections: { prefix: string; label: string; newLabel: string }[] = [
    { prefix: "/purchase-requests", label: "Purchase Requests", newLabel: "New Request" },
    { prefix: "/purchase-orders", label: "Purchase Orders", newLabel: "New Order" },
    { prefix: "/ris", label: "Requisition & Issue Slips", newLabel: "New RIS" },
    { prefix: "/inventory", label: "Inventory", newLabel: "New Item" },
    { prefix: "/reservations", label: "Facility Reservations", newLabel: "New Reservation" },
    { prefix: "/violations", label: "Ordinance Violations", newLabel: "" },
    { prefix: "/energy", label: "Energy Consumption", newLabel: "" },
    { prefix: "/water", label: "Water Consumption", newLabel: "" },
    { prefix: "/fuel", label: "Fuel Consumption", newLabel: "" },
    // Before "/records": the match is a prefix test, so the longer path has to
    // be offered first or an inventory would read as a disposition schedule.
    {
      prefix: "/records/inventory",
      label: "Records Inventory and Appraisal",
      newLabel: "New Inventory",
    },
    {
      prefix: "/records/disposal",
      label: "Authority to Dispose of Records",
      newLabel: "New Request",
    },
    { prefix: "/records", label: "Records Disposition Schedule", newLabel: "New Schedule" },
    { prefix: "/reports", label: "Reports & Analytics", newLabel: "" },
    { prefix: "/audit", label: "Audit Trail", newLabel: "" },
    { prefix: "/settings", label: "Settings", newLabel: "" },
  ];

  for (const { prefix, label, newLabel } of sections) {
    if (!pathname.startsWith(prefix)) continue;
    const rest = pathname.slice(prefix.length).split("/").filter(Boolean);
    if (rest.length === 0) {
      crumbs.push({ label });
    } else {
      crumbs.push({ label, onClick: () => navigate(prefix) });
      if (rest[0] === "new") crumbs.push({ label: newLabel });
      else if (rest[0] === "shelves") crumbs.push({ label: "Records Room" });
      else if (rest[1] === "edit") crumbs.push({ label: isRecordId(rest[0]) ? "Edit" : `Edit ${rest[0]}` });
      else if (!isRecordId(rest[0])) crumbs.push({ label: rest[0] });
    }
    return crumbs;
  }

  return crumbs;
}

function AppTopBar({
  onToggleSidebar,
  onRequestSignOut,
  onOpenNotifications,
  unreadCount,
}: {
  onToggleSidebar: () => void;
  onRequestSignOut: () => void;
  onOpenNotifications: () => void;
  unreadCount: number;
}) {
  const crumbs = useBreadcrumbs();
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <TopBar
      onToggleSidebar={onToggleSidebar}
      actions={
        <>
          {/* The search box did nothing when typed into (removal decided
              2026-09-18), and the office label repeated the sidebar's name. */}
          <NotificationBell count={unreadCount} onClick={onOpenNotifications} />
          <ProfileMenu
            name={user?.name ?? "Administrator"}
            detail={user?.office ?? "General Services Office"}
            initials={initialsOf(user?.name ?? "Administrator")}
            items={[
              ...(can(user, "manage:settings")
                ? [{ label: "Settings", icon: Settings, onClick: () => navigate("/settings") }]
                : []),
              { label: "Sign Out", icon: LogOut, destructive: true, onClick: onRequestSignOut },
            ]}
          />
        </>
      }
    >
      {/* A one-step trail only repeats the page title below it. */}
      {crumbs.length > 1 && <Breadcrumb items={crumbs} />}
    </TopBar>
  );
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const [confirmSignOut, setConfirmSignOut] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(readSidebarCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  // Applies the stored theme + accent to <html> for every page in the shell.
  useAppearanceSync();
  // Realtime-backed, so the badge moves without a page refresh.
  const { unreadCount } = useNotifications(React.useMemo(() => ({}), []));

  /**
   * One button, two jobs. The rail is `hidden md:flex`, so below that
   * breakpoint there is nothing to collapse — the same control has to open the
   * drawer instead. The check reads the viewport at click time rather than
   * tracking it in state, which keeps the two behaviours from ever disagreeing
   * after a resize or an orientation change.
   */
  const toggleSidebar = React.useCallback(() => {
    if (!window.matchMedia("(min-width: 768px)").matches) {
      setMobileNavOpen(true);
      return;
    }
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Storage unavailable (private mode): state still applies this session.
      }
      return next;
    });
  }, []);

  // A route change from anywhere — a breadcrumb, a card, the back button —
  // should not leave the drawer sitting open over the page it navigated to.
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const requestSignOut = () => setConfirmSignOut(true);

  const doSignOut = async () => {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    setConfirmSignOut(false);
    toast.success("You have been signed out");
    navigate("/login", { replace: true });
  };

  return (
    <>
      <AppShell
        sidebar={<AppSidebar collapsed={sidebarCollapsed} />}
        topBar={
          <AppTopBar
            onToggleSidebar={toggleSidebar}
            onRequestSignOut={requestSignOut}
            onOpenNotifications={() => setNotificationsOpen(true)}
            unreadCount={unreadCount}
          />
        }
      >
        {/* Cross-fades between routes so opening a create/edit form from a list
            transitions smoothly instead of snapping. AnimatePresence renders no
            DOM node, so the fill-height page layouts are unaffected. */}
        {/* Suspense sits outside AnimatePresence so a route's chunk can load
            without tearing down the exit animation of the page it replaces. */}
        <React.Suspense fallback={<PageFallback />}>
          <AnimatePresence mode="wait" initial={false}>
            <Outlet key={location.pathname} />
          </AnimatePresence>
        </React.Suspense>
      </AppShell>

      {/* Below 768px the rail is display:none, so this drawer is the only way
          to reach any module. `flex` overrides the rail's own `hidden`
          (tailwind-merge resolves the display conflict in favour of the last
          class), and the drawer is never collapsed — an icon-only rail makes
          no sense when it is already an overlay. */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[260px] p-0 md:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AppSidebar
            collapsed={false}
            onNavigate={() => setMobileNavOpen(false)}
            className="flex h-full w-full border-r-0"
          />
        </SheetContent>
      </Sheet>

      <NotificationDrawer open={notificationsOpen} onOpenChange={setNotificationsOpen} />
      <ConfirmationModal
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        icon={LogOut}
        tone="neutral"
        title="Sign out of General Services Office?"
        description="Your session will be closed and you'll need to sign in again to continue working."
        confirmLabel="Sign Out"
        loading={signingOut}
        onConfirm={doSignOut}
      />
    </>
  );
}
