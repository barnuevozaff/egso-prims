import * as React from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

/** Breadcrumb trail: muted ancestors, semibold current page. */
export function Breadcrumb({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    // min-w-0 lets the trail give way in a narrow top bar: on a phone only the
    // current page is shown, cut short with an ellipsis if it must be.
    <nav aria-label="Breadcrumb" className={cn("flex min-w-0 items-center gap-1.5 text-[13px]", className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${i}`}>
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-neutral-300 max-sm:hidden" />}
            {isLast ? (
              <span aria-current="page" className="truncate font-semibold text-neutral-800">
                {item.label}
              </span>
            ) : (
              <button
                onClick={item.onClick}
                className={cn(
                  "shrink-0 text-neutral-500 max-sm:hidden",
                  item.onClick && "transition hover:text-neutral-800",
                )}
              >
                {item.label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
