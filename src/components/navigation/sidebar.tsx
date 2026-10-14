import * as React from "react";

import { cn } from "@/lib/utils";
import { NotificationBadge } from "@/components/status/badges";

/**
 * Sidebar system: a 240px rail on its own ground, ruled right, sticky full
 * height.
 *
 * The rail was white, and so is every card — chrome and content painted the
 * same value, separated only by the paper gutter between them. It now sits a
 * shade below the canvas (`--sidebar`), which puts the three surfaces in a real
 * depth order: furniture, desk, paper.
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
    <div className="flex items-center gap-2 px-5 pb-brandb pt-brandt group-data-[collapsed=true]:justify-center group-data-[collapsed=true]:gap-0 group-data-[collapsed=true]:px-0">
      {logo ? (
        // Rendered at the mark's exact footprint; object-contain preserves the
        // seal's aspect ratio (never stretched/cropped/recolored).
        <img src={logo} alt={title} className="h-8 w-8 shrink-0 object-contain" />
      ) : (
        // Was bg-neutral-900 — the accent this system used before the seal
        // burgundy replaced it, left behind on the one tile that stands in for
        // the seal itself.
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-(--accent-solid) text-(--accent-contrast)">
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="flex min-w-0 flex-col leading-tight group-data-[collapsed=true]:hidden">
        <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-neutral-900">{title}</span>
        {subtitle && <span className="line-clamp-2 text-[12px] text-[#5b606b]">{subtitle}</span>}
      </div>
    </div>
  );
}

/** Scrollable middle region of the sidebar. */
export function SidebarContent({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 overflow-y-auto px-railpad pb-3">{children}</div>;
}

/** Labeled group of navigation items (e.g. "Modules", "Quick Access"). */
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
    <div className={className}>
      {label && (
        // neutral-600, not the component's neutral-500: the rail is a shade
        // deeper than the canvas, and 500 only reaches 4.13:1 against it.
        // A plain small heading, not an uppercase overline. #6b707a keeps
        // 4.6:1 on the rail's ground.
        <div className="px-2.5 pb-1.5 pt-4 text-[11.5px] font-medium text-[#6b707a] group-data-[collapsed=true]:hidden">
          {label}
        </div>
      )}
      <nav className="flex flex-col gap-0.5">{children}</nav>
    </div>
  );
}

export function SidebarDivider() {
  // neutral-200, not 100: on the rail's deeper ground the faint rule was within
  // a hair of the surface it was meant to divide.
  return <div className="my-4 border-t border-neutral-100" />;
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
        "flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring) disabled:pointer-events-none disabled:opacity-50 group-data-[collapsed=true]:justify-center group-data-[collapsed=true]:gap-0",
        // The page you are on is a small white card on the rail.
        active
          ? "bg-white font-medium text-neutral-900 shadow-[0_0_0_1px_#e6e6e3,0_1px_2px_rgba(22,24,29,0.05)]"
          : "text-[#4a4f59] hover:bg-[#f1f1ef] hover:text-neutral-900",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate text-left group-data-[collapsed=true]:hidden">{label}</span>
      {dot && (
        <NotificationBadge
          color={dot === "orange" ? "orange" : dot === "green" ? "green" : "red"}
          className="group-data-[collapsed=true]:hidden"
        />
      )}
      {badge && (
        // A count, in the mono face, quiet: the number is the news, not the colour.
        <span className="rounded-md bg-[#ececea] px-1.5 py-px font-['Geist_Mono',ui-monospace,monospace] text-[11.5px] tabular-nums text-neutral-900 group-data-[collapsed=true]:hidden">
          {badge.text}
        </span>
      )}
      {trailing}
    </button>
  );
}

/** Bottom-pinned region (user block). */
export function SidebarFooter({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-neutral-100 p-3">{children}</div>;
}
