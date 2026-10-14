import * as React from "react";
import { Check } from "lucide-react";

import { Input } from "@/components";
import { suggestStock, type StockSuggestion } from "@/features/ris/api";
import { cn } from "@/lib/utils";

/**
 * The portal's item name: typed freely, with up to eight matches from central
 * stock offered under it as the requester types (approved 15 Oct 2026).
 * Picking one fills the name and its unit. With no matches, or before the
 * suggestion function is installed, it is a plain text field.
 */
export function StockNameInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  onPick,
  invalid,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onPick: (s: StockSuggestion) => void;
  invalid?: boolean;
  className?: string;
}) {
  const [suggestions, setSuggestions] = React.useState<StockSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const listId = `${id}-suggestions`;

  // Wait for a pause in typing; a slower, older answer never replaces a newer one.
  React.useEffect(() => {
    let current = true;
    const t = window.setTimeout(() => {
      void suggestStock(value).then((rows) => {
        if (!current) return;
        // An exact match has nothing left to suggest.
        setSuggestions(rows.filter((r) => r.name.toLowerCase() !== value.trim().toLowerCase()));
        setActive(-1);
      });
    }, 200);
    return () => {
      current = false;
      window.clearTimeout(t);
    };
  }, [value]);

  const shown = open && suggestions.length > 0;

  const pick = (s: StockSuggestion) => {
    onPick(s);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={shown ? listId : undefined}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="e.g. Bond paper, A4"
        value={value}
        invalid={invalid}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onBlur();
        }}
        onKeyDown={(e) => {
          if (!shown) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(suggestions[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {shown && (
        <div className="absolute inset-x-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-xl border border-[#e4e4e1] bg-white shadow-[0_12px_32px_-8px_rgba(22,24,29,0.22)]">
          <p className="px-3 pb-1 pt-2 text-[12px] font-medium text-[#5b606b]">From the GSO stock list</p>
          <ul id={listId} role="listbox" aria-label="Stock suggestions" className="list-none px-1 pb-1">
            {suggestions.map((s, i) => (
              <li
                key={`${s.name}-${s.unit}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Keeps focus in the field, so the pick lands before blur closes the list.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-[14px] text-neutral-900",
                  i === active ? "bg-neutral-100" : "hover:bg-neutral-50",
                )}
              >
                <span className="min-w-0 flex-1">
                  {s.name} <span className="text-[#5b606b]">· {s.unit}</span>
                </span>
                {s.inStock ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-neutral-900">
                    <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
                    In stock
                  </span>
                ) : (
                  <span className="shrink-0 text-[12px] text-[#5b606b]">Out of stock</span>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-[#ececea] px-3 py-2 text-[12px] text-[#5b606b]">
            Not on the list? Keep typing. GSO will match it.
          </p>
        </div>
      )}
    </div>
  );
}
