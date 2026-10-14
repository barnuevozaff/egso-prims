import * as React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { PageFallback } from "@/components/feedback/page-fallback";
import { BRAND_LOGO } from "@/lib/brand";
import { PORTAL_SERVICES } from "@/features/portal/data";

/**
 * The staff portal's frame: the government strip, a letterhead masthead, and a
 * slim footer. No sidebar and no sign-in; the people filing here are staff of
 * the other municipal offices.
 *
 * `data-portal` switches on the portal's own tokens (see "THE PORTAL" in
 * index.css). It sits on this root for first paint and on <html> while the
 * portal is mounted, so the date pickers and selects the wizards portal to
 * <body> take the same crimson and corners as everything else here.
 */

/**
 * First thing in the tab order: a way past the masthead and the service nav.
 * Without it a keyboard user traverses the whole header on every page.
 */
function SkipLink() {
  return (
    <a
      href="#portal-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-neutral-900 focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-(--accent-ring)"
    >
      Skip to content
    </a>
  );
}

/** The service nav, shown on inner pages. On the home page the cards are the nav. */
function ServiceNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Portal services" className={className}>
      <ul className="flex gap-1 overflow-x-auto whitespace-nowrap text-[14px]">
        {PORTAL_SERVICES.map((s) => (
          <li key={s.to}>
            <NavLink
              to={s.to}
              className="block rounded-md px-3 py-2 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring) aria-[current=page]:font-semibold aria-[current=page]:text-(--accent-text)"
            >
              {s.navLabel}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The service nav on a phone or tablet: four equal columns across the screen.
 * The row beside the letterhead only fits from lg; below that it squeezed
 * the office name onto four lines.
 *
 * A single scrolling row cut a service off at the edge, and a scroll bar was
 * only a patch for that. Equal columns fit all four on any phone, so every
 * service, Track included, is one tap away and nothing is hidden. The one
 * long label, "Purchase Request", takes two lines instead.
 */
function MobileServiceNav() {
  return (
    <nav aria-label="Portal services" className="border-t border-neutral-200 lg:hidden">
      <ul className="grid grid-cols-4 gap-1 px-2 py-1">
        {PORTAL_SERVICES.map((s) => (
          <li key={s.to} className="min-w-0">
            <NavLink
              to={s.to}
              className="flex min-h-12 items-center justify-center rounded-md px-1 py-1.5 text-center text-[13px] leading-tight text-neutral-600 hyphens-auto transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--accent-ring) aria-[current=page]:font-semibold aria-[current=page]:text-(--accent-text)"
            >
              {s.navLabel}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function PortalLayout() {
  const { pathname } = useLocation();
  const isHome = pathname === "/portal" || pathname === "/portal/";

  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-portal", "");
    return () => root.removeAttribute("data-portal");
  }, []);

  return (
    <div data-portal="" className="flex min-h-[100dvh] flex-col bg-canvas font-['Geist',ui-sans-serif,system-ui,sans-serif] text-neutral-900 antialiased">
      <SkipLink />

      {/* Masthead. The government strip that sat above it moved to the footer:
          it is who runs the office, not something a filer acts on. */}
      <header className="border-b border-[#ececea] bg-white">
        <div className="mx-auto flex min-h-[68px] w-full max-w-[1120px] items-center justify-between gap-6 px-5 py-3 sm:px-6">
          <Link
            to="/portal"
            className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none lg:shrink-0 focus-visible:ring-2 focus-visible:ring-(--accent-ring) focus-visible:ring-offset-2"
          >
            <img
              src={BRAND_LOGO}
              alt="Seal of the Municipality of Alaminos"
              className="h-9 w-9 shrink-0 object-contain"
            />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-[15px] font-semibold tracking-[-0.01em] text-neutral-900">
                General Services Office
              </span>
              <span className="text-[13px] text-[#5b606b]">Municipality of Alaminos, Laguna</span>
            </span>
          </Link>

          {isHome ? (
            <span className="hidden text-[13px] text-[#5b606b] md:block">
              Purchase Request &amp; Inventory Management
            </span>
          ) : (
            <ServiceNav className="hidden lg:block" />
          )}
        </div>
        {!isHome && <MobileServiceNav />}
      </header>

      {/* The portal's pages are code-split like the admin's. */}
      <main id="portal-content" tabIndex={-1} className="flex flex-1 flex-col focus-visible:outline-none">
        <React.Suspense fallback={<PageFallback />}>
          <Outlet />
        </React.Suspense>
      </main>

      <footer className="border-t border-[#ececea] bg-white">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-5 py-6 text-[13px] text-[#5b606b] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex items-center gap-2.5">
            <img src={BRAND_LOGO} alt="" className="h-5 w-5 object-contain" />
            General Services Office · Municipality of Alaminos, Laguna
          </span>
          <span>Republic of the Philippines · Province of Laguna</span>
        </div>
      </footer>
    </div>
  );
}
