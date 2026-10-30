import * as React from "react";
import { Bell, PanelLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Application header: the rail's tone, bottom border, horizontal slot layout
 * (Design Foundation top bar). It sits above <main>, the page's only
 * scroller, so nothing passes beneath it: the translucency and backdrop blur
 * it had showed nothing and were dropped (30 Oct 2026).
 */
export function TopBar({
  onToggleSidebar,
  children,
  actions,
  className,
}: {
  onToggleSidebar?: () => void;
  /** Left content, typically a Breadcrumb. */
  children?: React.ReactNode;
  /** Right-aligned controls (search, office switcher, bell, profile). */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        // The rail's tone, not white: the bar and the rail are both chrome and
        // they meet at the top-left corner, so painting one lighter than the
        // canvas and the other darker split the frame into two materials.
        "sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-sidebar px-barpx py-barpy md:px-8",
        className,
      )}
    >
      {onToggleSidebar && (
        <button
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
          className="shrink-0 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      )}
      {children}
      {/* Never squeezed: on a phone the trail gives way, not the bell and the account. */}
      <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
    </header>
  );
}

/** Bordered bell button with unread indicator dot. */
export function NotificationBell({
  hasUnread = false,
  count,
  onClick,
  className,
}: {
  hasUnread?: boolean;
  /** Unread total; renders a numeric badge instead of the plain dot. */
  count?: number;
  onClick?: () => void;
  className?: string;
}) {
  const unread = count !== undefined ? count > 0 : hasUnread;
  return (
    <button
      aria-label={unread ? `Notifications (${count ?? "unread"})` : "Notifications"}
      onClick={onClick}
      className={cn(
        "relative rounded-lg border border-neutral-200 bg-white p-1.5 text-neutral-600 transition hover:bg-neutral-50",
        className,
      )}
    >
      <Bell className="h-4 w-4" />
      {unread &&
        (count === undefined ? (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
        ) : (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9.5px] font-semibold tabular-nums text-white">
            {count > 99 ? "99+" : count}
          </span>
        ))}
    </button>
  );
}
