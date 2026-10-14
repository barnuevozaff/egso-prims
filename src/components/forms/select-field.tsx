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
}: SelectFieldProps) {
  const a11y = useFieldBinding({ id, invalid });
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        {...a11y}
        aria-label={ariaLabel}
        className={cn(
          "h-auto w-full rounded-lg border-neutral-200 bg-white px-3 py-1.5 text-[12.5px] text-neutral-800 shadow-none transition focus-visible:ring-2 focus-visible:ring-(--accent-ring) data-[placeholder]:text-neutral-500 aria-invalid:border-red-400",
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled} className="text-[12.5px]">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
