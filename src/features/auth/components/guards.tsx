import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Building2 } from "lucide-react";

import { Spinner } from "@/components/feedback/spinner";
import { useAuth } from "@/features/auth/auth-context";
import { can, type Permission, type Role } from "@/features/auth/types";

/** Full-screen boot state while the session is being restored. */
function AuthLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas font-sans">
      <div className="flex flex-col items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-neutral-900 text-white">
          <Building2 className="h-5 w-5" />
        </div>
        <Spinner size="sm" label="Restoring session…" />
      </div>
    </div>
  );
}

/**
 * Route guard: unauthenticated users are redirected to /login, remembering
 * the page they wanted so login can send them back.
 */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <AuthLoading />;
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/**
 * Route guard for pages a role may not open (Settings, the Audit trail,
 * create and edit forms). Sends the person to the dashboard instead of
 * showing a page whose every request firestore.rules would refuse.
 */
export function PermissionRoute({
  permission,
  children,
}: {
  permission: Permission;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (!can(user, permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Role/permission guard for sections inside protected pages. */
export function RequireRole({
  roles,
  permission,
  fallback = null,
  children,
}: {
  roles?: Role[];
  permission?: Permission;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (!user) return <>{fallback}</>;
  if (roles && !roles.includes(user.role)) return <>{fallback}</>;
  if (permission && !can(user, permission)) return <>{fallback}</>;
  return <>{children}</>;
}
