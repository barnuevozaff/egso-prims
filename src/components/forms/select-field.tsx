import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useFieldBinding } from "@/components/forms/field-context";

export interface SelectFieldOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps {
  options: SelectFieldOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  /** Falls back to the enclosing Field's generated id. */
  id?: string;
  /** For a select with no visible label, such as a table cell. */
  "aria-label"?: string;
  /**
   * `lg` is the portal forms' list: 44px options in 14px type, as in the
   * approved office picker. `default` keeps the admin's compact list.
   */
  size?: "default" | "lg";
}

/** Single-value select styled to match form inputs. */
export function SelectField({
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  invalid,
  className,
  id,
  "aria-label": ariaLabel,
  size = "default",
}: SelectFieldProps) {
  const lg = size === "lg";
  const a11y = useFieldBinding({ id, invalid });
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        {...a11y}
        aria-label={ariaLabel}
        className={cn(
          lg && "data-[size=default]:h-10",
          "h-auto w-full rounded-lg border-neutral-200 bg-white px-3 py-1.5 text-[12.5px] text-neutral-800 shadow-none transition focus-visible:ring-2 focus-visible:ring-(--accent-ring) data-[placeholder]:text-neutral-500 aria-invalid:border-red-400",
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      {/*
       * The list opens below its field ("popper"), never on top of it. The
       * default "item-aligned" mode laid the list over the field and the
       * columns beside it, which in a narrow table cell covered the next input.
       */}
      <SelectContent
        position="popper"
        align="start"
        sideOffset={4}
        className={cn(
          "max-h-[min(var(--radix-select-content-available-height),30rem)] min-w-[max(var(--radix-select-trigger-width),8rem)]",
          lg && "rounded-xl border-[#e4e4e1] bg-white shadow-[0_12px_32px_-8px_rgba(22,24,29,0.22)]",
        )}
      >
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            className={
              lg
                ? "min-h-11 rounded-lg pl-3 pr-9 text-[14px] text-neutral-900 focus:bg-[#f4f4f2] focus:text-neutral-900 data-[state=checked]:font-medium [&_svg]:text-neutral-900"
                : "text-[12.5px]"
            }
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
