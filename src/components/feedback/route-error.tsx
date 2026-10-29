import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from "react-router-dom";
import { AlertTriangle, ArrowLeft, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isPortalPath, portalPath } from "@/features/portal/paths";

/**
 * What a route renders when it throws, and what an unknown URL renders.
 *
 * Before this existed a render-time error unmounted the application to a blank
 * white page with nothing written to the user and no way back, and a mistyped
 * or stale URL matched nothing and rendered the same emptiness. Staff reach
 * this system by bookmark and pasted link, so both cases are routine rather
 * than exotic.
 *
 * The copy says what happened and what to do about it, and never blames the
 * person reading it. The technical detail is kept, but folded away — it is for
 * the person who has to fix it, not the clerk who hit it.
 */
export function RouteError({ notFound: unknownAddress = false }: { notFound?: boolean } = {}) {
  const error = useRouteError();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  /*
   * An unmatched URL reaches this component as the catch-all route's element,
   * not as an errorElement, so there is no route error to read and the page
   * announced a failure ("your work has not been submitted") for what is only
   * a wrong address. The catch-all says so itself instead.
   */
  const notFound = unknownAddress || (isRouteErrorResponse(error) && error.status === 404);

  /*
   * The portal is used by staff of the other offices, who hold no account
   * here: sending them "back" to the admin dashboard only bounces them to a
   * login they cannot pass. Within the portal, back means the portal.
   */
  const inPortal = isPortalPath(pathname);
  const home = inPortal ? portalPath() : "/";

  const detail =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText}`
        : null;

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-5 font-sans">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-amber-50 text-amber-600">
          <AlertTriangle className="h-5 w-5" />
        </span>

        <h1 className="mt-4 text-[20px] font-semibold tracking-tight text-neutral-900">
          {notFound ? "Page not found" : "Something went wrong"}
        </h1>

        <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
          {notFound
            ? "That address does not match any page in this system. It may have been renamed, or the link that brought you here may be out of date."
            : "This page could not be displayed. Your work has not been submitted — reload to try again, and if it keeps happening report it to the General Services Office."}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Button onClick={() => navigate(home, { replace: true })}>
            <ArrowLeft />
            {inPortal ? "Back to the portal" : "Back to Dashboard"}
          </Button>
          {!notFound && (
            <Button variant="secondary" onClick={() => window.location.reload()}>
              <RotateCw />
              Reload
            </Button>
          )}
        </div>

        {detail && (
          <details className="mt-7 text-left">
            <summary className="cursor-pointer text-[11.5px] text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring)">
              Technical detail
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-left text-[11px] leading-relaxed text-neutral-600">
              {detail}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
