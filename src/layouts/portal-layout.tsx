import * as React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { PageFallback } from "@/components/feedback/page-fallback";
import { BRAND_LOGO } from "@/lib/brand";
import { PORTAL_SERVICES } from "@/features/portal/data";
import { isPortalHome, portalPath } from "@/features/portal/paths";

/**
 * The public portal's frame (second pass, 20 Oct 2026): a deep-red
 * government strip, a white masthead with the seal and the office, and a
 * deep-red municipal footer. No sidebar and no sign-in.
 *
 * `data-portal` switches on the portal's own tokens (see "THE PORTAL" in
 * index.css). It sits on this root for first paint and on <html> while the
 * portal is mounted, so the date pickers and selects the wizards portal to
 * <body> take the same red and corners as everything else here.
 */

/** Deep municipal red: the strip, the banner and the footer. */
const DEEP_RED = "bg-[#84272e]";

/**
 * First thing in the tab order: a way past the masthead and the service nav.
 * Without it a keyboard user traverses the whole header on every page.
 */
function SkipLink() {
  return (
    <a
      href="#portal-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[#202124] focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-(--accent-ring)"
    >
      Skip to content
    </a>
  );
}

/** The service nav, shown on inner pages. On the home page the cards are the nav. */
function ServiceNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Portal services" className={className}>
      <ul className="flex h-full gap-1 whitespace-nowrap text-[14px]">
        {PORTAL_SERVICES.map((s) => (
          <li key={s.to} className="flex">
            {/* The current page is marked by weight, colour and a red rule,
                never by colour alone. */}
            <NavLink
              to={s.to}
              className="relative flex items-center rounded-md px-3 text-[#5c5752] transition-colors after:absolute after:inset-x-3 after:-bottom-[13px] after:h-[3px] after:rounded-full hover:text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring) aria-[current=page]:font-semibold aria-[current=page]:text-[#a6323b] aria-[current=page]:after:bg-[#a6323b]"
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
 * The service nav on a phone or tablet: four equal columns across the screen,
 * so every service, Track included, is one tap away and nothing is hidden.
 */
function MobileServiceNav() {
  return (
    <nav aria-label="Portal services" className="border-t border-[#ebe6e1] lg:hidden">
      <ul className="grid grid-cols-4 gap-1 px-2 py-1">
        {PORTAL_SERVICES.map((s) => (
          <li key={s.to} className="min-w-0">
            <NavLink
              to={s.to}
              className="flex min-h-12 items-center justify-center rounded-md px-1 py-1.5 text-center text-[13px] leading-tight text-[#5c5752] hyphens-auto transition-colors hover:bg-[#f4f1ee] hover:text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--accent-ring) aria-[current=page]:bg-[#f8edef] aria-[current=page]:font-semibold aria-[current=page]:text-[#a6323b]"
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
  const isHome = isPortalHome(pathname);

  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-portal", "");
    return () => root.removeAttribute("data-portal");
  }, []);

  return (
    <div data-portal="" className="flex min-h-[100dvh] flex-col bg-canvas font-['Geist',ui-sans-serif,system-ui,sans-serif] text-[#202124] antialiased">
      <SkipLink />

      {/* The government strip: who runs the office, as on official PH sites. */}
      <div className={`${DEEP_RED} text-white print:hidden`}>
        <div className="mx-auto flex min-h-8 w-full max-w-[1120px] items-center justify-between gap-4 px-4 text-[12px] sm:px-6">
          <span>Republic of the Philippines · Province of Laguna</span>
          <span lang="fil" className="hidden text-white/85 sm:inline">
            Pamahalaang Bayan ng Alaminos
          </span>
        </div>
      </div>

      <header className="border-b border-[#ebe6e1] bg-white print:hidden">
        <div className="mx-auto flex min-h-[72px] w-full max-w-[1120px] items-stretch justify-between gap-6 px-4 sm:px-6">
          <Link
            to={portalPath()}
            className="my-3 flex min-w-0 items-center gap-3.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring) focus-visible:ring-offset-2 lg:shrink-0"
          >
            <img
              src={BRAND_LOGO}
              alt="Seal of the Municipality of Alaminos"
              className="h-11 w-11 shrink-0 object-contain"
            />
            <span aria-hidden="true" className="h-9 w-px shrink-0 bg-[#e5dfd9]" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-[16px] font-semibold tracking-[-0.01em] text-[#202124]">
                General Services Office
              </span>
              <span className="mt-0.5 text-[13px] text-[#5c5752]">Municipality of Alaminos, Laguna</span>
            </span>
          </Link>

          {/* On the home page the service cards are the nav, and the banner names the portal. */}
          {!isHome && <ServiceNav className="hidden py-3 lg:block" />}
        </div>
        {!isHome && <MobileServiceNav />}
      </header>

      {/* The portal's pages are code-split like the admin's. */}
      <main id="portal-content" tabIndex={-1} className="flex flex-1 flex-col focus-visible:outline-none">
        <React.Suspense fallback={<PageFallback />}>
          <Outlet />
        </React.Suspense>
      </main>

      {/* Verified identity only: no contact details or links that the office
          has not confirmed (20 Oct 2026). */}
      <footer className={`${DEEP_RED} text-white print:hidden`}>
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-4 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white">
              <img src={BRAND_LOGO} alt="" className="h-9 w-9 object-contain" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[15px] font-semibold">General Services Office</span>
              <span className="mt-0.5 text-[13px] text-white/85">Municipality of Alaminos, Laguna</span>
            </span>
          </div>
          <div className="text-[13px] text-white/85 sm:text-right">
            <p>Republic of the Philippines · Province of Laguna</p>
            <p lang="fil" className="mt-0.5">Pamahalaang Bayan ng Alaminos</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
