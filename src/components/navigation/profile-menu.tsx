import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar } from "@/components/utilities/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ProfileMenuItem {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  destructive?: boolean;
}

export interface ProfileMenuProps {
  name: string;
  /** Secondary line in the menu header (e.g. role or email). */
  detail?: string;
  initials?: string;
  items?: ProfileMenuItem[];
  className?: string;
}

/** Top-bar profile button (avatar + name + chevron) with dropdown actions. */
export function ProfileMenu({ name, detail, initials, items = [], className }: ProfileMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 rounded-lg border border-neutral-200 bg-white py-1 pl-1 pr-2 text-[12.5px] font-medium text-neutral-700 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring)",
            className,
          )}
        >
          <Avatar size="sm" name={name} initials={initials} className="rounded-[7px] bg-none bg-neutral-900" />
          {name}
          <ChevronDown className="h-3 w-3 text-neutral-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[12.5px]">
          <div className="font-semibold text-neutral-800">{name}</div>
          {detail && <div className="text-[11px] font-normal text-neutral-500">{detail}</div>}
        </DropdownMenuLabel>
        {items.length > 0 && <DropdownMenuSeparator />}
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.label}
              onClick={item.onClick}
              className={cn(
                "text-[12.5px]",
                item.destructive && "text-red-600 focus:text-red-600",
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
