import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useFieldBinding } from "@/components/forms/field-context";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  /** Falls back to the enclosing Field's generated id. */
  id?: string;
}

/** Single-date form input opening a calendar popover. */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  invalid,
  className,
  id,
}: DatePickerProps) {
  const a11y = useFieldBinding({ id, invalid });
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          {...a11y}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[12.5px] transition focus:outline-none focus:ring-2 focus:ring-(--accent-ring) disabled:pointer-events-none disabled:opacity-60 aria-invalid:border-red-400",
            value ? "text-neutral-800" : "text-neutral-400",
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 text-neutral-500" />
          {value ? format(value, "d MMMM yyyy") : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        {/*
         * `required` stops react-day-picker treating a click on the already
         * selected day as a deselect. Without it that click returns undefined,
         * which React Hook Form reads as "unset" and falls back to the default
         * — so the button kept showing a date while the form held none, and
         * submitting failed with "select a date" against a filled-in field.
         * Every date in this app is a required field, so clearing by
         * re-clicking is never the intent.
         */}
        <Calendar
          mode="single"
          required
          selected={value}
          onSelect={(d) => {
            onChange?.(d);
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
