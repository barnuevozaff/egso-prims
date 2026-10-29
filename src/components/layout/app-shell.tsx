import * as React from "react";

import { cn } from "@/lib/utils";
import { PageTitle, Subtitle } from "@/components/typography/typography";

/**
 * Application frame: sidebar rail + content column.
 *
 * Three surfaces, three depths — the rail (`--sidebar`) sits below the canvas
 * (`--canvas`, the portal's bond paper), and the white cards sit above it. The
 * outer ground matches the rail so the frame holds its material before the
 * sidebar paints and behind it on overscroll.
 */
export function AppShell({
  sidebar,
  topBar,
  children,
}: {
  sidebar: React.ReactNode;
  topBar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-sidebar font-sans antialiased">
      {/*
       * First stop in the tab order. The rail carries ~15 nav items and the
       * top bar another four controls, so without this a keyboard user walks
       * all of them again on every route change.
       */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-neutral-900 focus:px-4 focus:py-2 focus:text-[12.5px] focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-(--accent-ring)"
      >
        Skip to content
      </a>
      {sidebar}
      <div className="flex h-screen min-w-0 flex-1 flex-col bg-canvas">
        {topBar}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 space-y-6 overflow-y-auto px-5 py-6 focus-visible:outline-none md:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/** Page heading block: title + subtitle on the left, actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    // On a phone the actions sit under the title, so a page with two actions
    // does not squeeze its title and description into a sliver (24 Oct 2026).
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4", className)}>
      <div className="min-w-0">
        <PageTitle>{title}</PageTitle>
        {description && <Subtitle className="mt-1">{description}</Subtitle>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
