import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

/**
 * Records Management in one place (30 Oct 2026): the Records Room, and the
 * register of each of its three forms. One sidebar entry leads here; these
 * tabs lead on, so every register is a click away from the room.
 */
const TABS = [
  { to: "/records", label: "Records Room", end: true },
  { to: "/records/schedules", label: "Disposition schedules" },
  { to: "/records/inventory", label: "Inventory and appraisal" },
  { to: "/records/disposal", label: "Authority to dispose" },
];

export function RecordsNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Records Management" className={cn("-mx-1 overflow-x-auto", className)}>
      <ul className="flex min-w-max list-none items-center gap-1 px-1">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  "inline-flex min-h-11 items-center rounded-[10px] px-3.5 text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]",
                  isActive ? "bg-white font-medium text-neutral-900 shadow-[0_0_0_1px_#e6e6e3]" : "text-[#5b606b] hover:bg-[#f4f4f2] hover:text-neutral-900",
                )
              }
            >
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
