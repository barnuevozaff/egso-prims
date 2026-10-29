import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { RouterProvider } from "react-router-dom";

// Imported by path, not through the "@/components" barrel: this module loads
// on every path, and the barrel would pull the whole component library —
// Chart.js included — into the entry chunk.
import { PageFallback } from "@/components/feedback/page-fallback";
import { Toaster } from "@/components/feedback/toaster";
import { AuthProvider } from "@/features/auth/auth-context";
import { applyCachedAppearance } from "@/features/config/theme";
import "@/index.css";

// Paint the stored theme before React mounts, so there is no flash of the
// wrong palette on reload or a cold start at the login screen.
applyCachedAppearance();

/*
 * The admin app, or the public portal site's portal-only routes
 * (VITE_APP_SURFACE=portal, 22 Oct 2026). The condition is fixed at build
 * time, so the portal build drops the admin router and every admin page.
 */
const loadRouter = () =>
  import.meta.env.VITE_APP_SURFACE === "portal" ? import("@/portal-router") : import("@/router");

void loadRouter().then(({ router }) =>
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/*
     * `reducedMotion="user"` makes every motion component in the app honour
     * the operating system's "reduce motion" setting — it drops transform and
     * layout animation and keeps opacity, which is the behaviour that setting
     * asks for. Doing it here rather than per component is why the eight files
     * that animate do not each need their own `useReducedMotion` check.
     */}
    <MotionConfig reducedMotion="user">
    <AuthProvider>
      {/*
       * The layouts hold their own Suspense boundaries so page chrome survives
       * a route change. This one only catches the routes that sit outside a
       * layout — the login screen and the catch-all.
       */}
      <Suspense fallback={<PageFallback />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster />
    </AuthProvider>
    </MotionConfig>
  </StrictMode>,
),
);
