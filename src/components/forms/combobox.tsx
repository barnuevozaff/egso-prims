import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { useFieldBinding } from "@/components/forms/field-context";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary line under the label, e.g. how much stock is on hand. */
  description?: string;
  /** Extra words the search matches, for an option whose label is short. */
  keywords?: string[];
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  /**
   * Let the caller keep whatever was typed, not just what is on the list.
   * The typed text is offered as the first entry and passed through as the
   * value — used where the list is a suggestion rather than a constraint.
   */
  allowCustomValue?: boolean;
  /** Falls back to the enclosing Field's generated id. */
  id?: string;
  /** Classes for each option row, e.g. a larger target on the portal. */
  itemClassName?: string;
}

/** Searchable select (Popover + Command) for long option lists. */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results found.",
  disabled,
  invalid,
  className,
  allowCustomValue = false,
  id,
  itemClassName,
}: ComboboxProps) {
  const a11y = useFieldBinding({ id, invalid });
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = options.find((o) => o.value === value);
  // A custom value is not on the list, so it has no option to read a label
  // from — it is shown as typed.
  const shownLabel = selected?.label ?? (value || undefined);
  const typed = query.trim();
  const offerTyped =
    allowCustomValue &&
    typed.length > 0 &&
    !options.some((o) => o.label.toLowerCase() === typed.toLowerCase());

  const choose = (next: string) => {
    onChange?.(next);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          {...a11y}
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[12.5px] transition focus:outline-none focus:ring-2 focus:ring-(--accent-ring) disabled:pointer-events-none disabled:opacity-60 aria-invalid:border-red-400",
            shownLabel ? "text-neutral-800" : "text-neutral-400",
            className,
          )}
        >
          <span className="truncate">{shownLabel ?? placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            className="text-[12.5px]"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-[12.5px] text-neutral-500">
              {emptyText}
            </CommandEmpty>
            {offerTyped && (
              <CommandGroup>
                <CommandItem value={typed} className="text-[12.5px]" onSelect={() => choose(typed)}>
                  <Check className="h-3.5 w-3.5 opacity-0" />
                  <span>
                    Use <span className="font-medium text-neutral-900">“{typed}”</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  keywords={o.keywords}
                  className={cn("text-[12.5px]", itemClassName)}
                  onSelect={() => choose(o.value)}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5",
                      o.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.description && (
                      <span className="block text-[11px] text-neutral-500">{o.description}</span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
