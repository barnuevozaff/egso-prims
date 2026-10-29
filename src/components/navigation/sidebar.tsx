import * as React from "react";

import { cn } from "@/lib/utils";
import { NotificationBadge } from "@/components/status/badges";

/**
 * Sidebar system: a 240px rail on its own ground, ruled right, sticky full
 * height.
 *
 * Redesigned 21 Oct 2026 to read less heavy: a thin Alaminos-red line across
 * the top, the seal and office name, then always-open groups with room
 * between them and quiet labels and icons, so the eye finds a section first
 * and the page second. The page you are on carries the red: a tinted row with
 * a short bar at its left edge. Audit trail and Settings sit in the footer,
 * out of the daily list.
 */

export function Sidebar({
  className,
  collapsed = false,
  children,
}: {
  className?: string;
  /** Icon-only rail when true. Sub-components hide their labels via CSS. */
  collapsed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        // `group` + data-collapsed drives the icon-only state of every child
        // through CSS (no prop-drilling, no child re-renders). Width animates.
        "group sticky top-0 hidden h-screen w-rail shrink-0 flex-col overflow-hidden border-r border-[#ececea] bg-[#fafaf9] transition-[width] duration-200 ease-out data-[collapsed=true]:w-[68px] md:flex",
        // The municipal red, once, as a hairline across the top of the rail.
        "before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-[#a6323b] before:content-['']",
        className,
      )}
    >
      {children}
    </aside>
  );
}

/** Brand block: official logo (when configured) or the built-in icon tile,
 *  plus product name + locality line. */
export function SidebarBrand({
  icon: Icon,
  title,
  subtitle,
  logo,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  /** Official logo URL/path; when set it replaces the built-in icon mark. */
  logo?: string;
}) {
  return (
    <div className="mx-3 flex items-center gap-2.5 border-b border-[#ececea] px-1 pb-4 pt-5 group-data-[collapsed=true]:mx-2 group-data-[collapsed=true]:justify-center group-data-[collapsed=true]:gap-0 group-data-[collapsed=true]:px-0">
      {logo ? (
        // Rendered at the mark's exact footprint; object-contain preserves the
        // seal's aspect ratio (never stretched/cropped/recolored).
        <img src={logo} alt={title} className="h-8 w-8 shrink-0 object-contain" />
      ) : (
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#a6323b] text-white">
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="flex min-w-0 flex-col leading-tight group-data-[collapsed=true]:hidden">
        <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-neutral-900">{title}</span>
        {subtitle && <span className="mt-0.5 line-clamp-2 text-[12px] text-[#5b606b]">{subtitle}</span>}
      </div>
    </div>
  );
}

/** Scrollable middle region of the sidebar. */
export function SidebarContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto px-3 pt-1">
      {children}
      {/* On a short screen the list scrolls under the footer: a soft fade at
          its lower edge says there is more. At the end of the list it is just
          the bottom margin. */}
      <div
        aria-hidden="true"
        className="pointer-events-none sticky bottom-0 h-5 bg-[linear-gradient(to_top,#fafaf9,rgba(250,250,249,0))]"
      />
    </div>
  );
}

/** Labeled group of navigation items (e.g. "Procurement"). Always open. */
export function SidebarGroup({
  label,
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("pt-4 first:pt-3", className)}>
      {label && (
        <>
          {/* A plain small heading, not an uppercase overline. #6b707a keeps
              4.6:1 on the rail's ground. */}
          <div className="px-2.5 pb-1.5 text-[12px] font-medium text-[#6b707a] group-data-[collapsed=true]:hidden">
            {label}
          </div>
          {/* On the icon-only rail a short rule stands in for the heading. */}
          <div aria-hidden="true" className="mx-3 mb-2 hidden h-px bg-[#e6e6e3] group-data-[collapsed=true]:block" />
        </>
      )}
      <nav aria-label={label} className="flex flex-col gap-px">
        {children}
      </nav>
    </div>
  );
}

export function SidebarDivider() {
  return <div className="my-4 border-t border-[#ececea]" />;
}

export interface SidebarItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  badge?: { text: string; color: "blue" | "green" | "orange" };
  dot?: "orange" | "green" | "red";
  trailing?: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}

export function SidebarItem({
  icon: Icon,
  label,
  active = false,
  badge,
  dot,
  trailing,
  disabled = false,
  onClick,
}: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={cn(
        "relative flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b] disabled:pointer-events-none disabled:opacity-50 group-data-[collapsed=true]:justify-center group-data-[collapsed=true]:gap-0",
        // The page you are on: a red-tinted row with a short bar at its edge.
        active
          ? "bg-[#f8edef] font-medium text-[#84272e] before:absolute before:inset-y-[7px] before:left-0 before:w-[3px] before:rounded-r-full before:bg-[#a6323b] before:content-['']"
          : "text-[#3f444d] hover:bg-[#f1f1ef] hover:text-neutral-900",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[#a6323b]" : "text-[#7c818b]")} />
      <span className="flex-1 truncate text-left group-data-[collapsed=true]:hidden">{label}</span>
      {dot && (
        <NotificationBadge
          color={dot === "orange" ? "orange" : dot === "green" ? "green" : "red"}
          className="group-data-[collapsed=true]:hidden"
        />
      )}
      {badge && (
        // Work waiting: a small red-tinted count. Geist's tabular figures, not the mono face.
        <span
          className={cn(
            "min-w-[22px] rounded-full px-1.5 py-px text-center text-[11.5px] font-medium tabular-nums group-data-[collapsed=true]:hidden",
            active ? "bg-white text-[#84272e]" : "bg-[#f3e3e5] text-[#84272e]",
          )}
        >
          {badge.text}
        </span>
      )}
      {/* The icon-only rail keeps a hint that something is waiting. */}
      {badge && (
        <span
          aria-hidden="true"
          className="absolute right-3 top-1.5 hidden h-1.5 w-1.5 rounded-full bg-[#a6323b] group-data-[collapsed=true]:block"
        />
      )}
      {trailing}
    </button>
  );
}

/** Bottom-pinned region (Audit trail, Settings). */
export function SidebarFooter({ children }: { children: React.ReactNode }) {
  return <div className="mx-3 border-t border-[#ececea] py-3">{children}</div>;
}
