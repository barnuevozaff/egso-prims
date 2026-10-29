import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface DropdownFilterOption {
  value: string;
  label: string;
}

export interface DropdownFilterProps {
  /** Placeholder shown when nothing is selected, e.g. "Status". */
  label: string;
  options: DropdownFilterOption[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * A filter is "applied" when its first option is the catch-all ("All …",
 * "Active …") and something else is chosen. Period pickers (months, years),
 * whose first option is just the first month, are never marked.
 */
const isCatchAll = (label: string | undefined) => !!label && /^(all|active)\b/i.test(label.trim());

/** Compact select used in filter bars. An applied filter is tinted, so a narrowed list is obvious (24 Oct 2026). */
export function DropdownFilter({
  label,
  options,
  value,
  onChange,
  disabled,
  className,
}: DropdownFilterProps) {
  const applied = isCatchAll(options[0]?.label) && value !== undefined && value !== options[0]?.value;
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        size="sm"
        data-applied={applied || undefined}
        className={cn(
          "h-auto gap-1.5 rounded-lg border-neutral-200 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-neutral-700 shadow-none transition hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-(--accent-ring) data-[placeholder]:text-neutral-700",
          applied && "border-[#e8c9ce] bg-[#fdf6f7] text-[#84272e] hover:bg-[#f8edef]",
          className,
        )}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-[12.5px]">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
