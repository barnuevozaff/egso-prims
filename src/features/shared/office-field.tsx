import { Combobox } from "@/components";
import { useOfficeOptions } from "@/features/offices/use-offices";

/**
 * The requesting office: a searchable list of the offices in the office
 * directory (Settings → Office / Department Management, 29 Oct 2026), the
 * same list on the admin site and the public portal. The office's name is
 * saved on the record as it reads today, so a later rename or removal never
 * changes a document already filed. A record whose office is no longer
 * listed keeps it (useOfficeOptions).
 */
export function OfficeField({
  id,
  value,
  onChange,
  onBlur,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  /** The id of the field's error message. */
  describedBy?: string;
}) {
  const { options, status } = useOfficeOptions(value);

  return (
    <Combobox
      id={id}
      placeholder={status === "loading" && !options.length ? "Loading offices…" : "Select your office…"}
      searchPlaceholder="Search offices…"
      emptyText={
        status === "error" && !options.length
          ? "The office list could not be loaded. Check the connection and reload the page."
          : "No office matches."
      }
      options={options}
      value={value || undefined}
      onChange={(v) => {
        onChange(v);
        onBlur?.();
      }}
      invalid={invalid}
      className="h-11 rounded-[10px] border-[#d4d5d2] px-3.5 text-[15px]"
      itemClassName="min-h-11 text-[14px]"
    />
  );
}
