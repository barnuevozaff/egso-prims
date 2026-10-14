import * as React from "react";

import { Combobox, Input } from "@/components";
import { DEPARTMENTS } from "@/features/purchase-requests/types";

const OTHER = "__other__";

const isListed = (value: string) => DEPARTMENTS.some((d) => d.code === value);

const OPTIONS = [
  // The list shows codes only, as the offices call themselves; the full name
  // is still searched, so typing "health" finds MHO.
  ...DEPARTMENTS.map((d) => ({ value: d.code, label: d.code, keywords: [d.name] })),
  { value: OTHER, label: "Other office…", keywords: ["other", "not listed"] },
];

/**
 * The requesting office: a searchable list of the municipal offices, with
 * "Other office…" for one that is not listed, which is then typed. A listed
 * office is saved as its code, another as the typed name, so a record from
 * before the list (whose office was typed) opens on "Other office…" with its
 * text in place.
 */
export function OfficeField({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [other, setOther] = React.useState(() => value !== "" && !isListed(value));

  return (
    <div className="space-y-3">
      <Combobox
        id={id}
        placeholder="Select your office…"
        searchPlaceholder="Search office or code…"
        emptyText="No office matches. Pick “Other office…”."
        options={OPTIONS}
        value={other ? OTHER : value || undefined}
        onChange={(v) => {
          if (v === OTHER) {
            setOther(true);
            onChange(isListed(value) ? "" : value);
          } else {
            setOther(false);
            onChange(v);
          }
          onBlur?.();
        }}
        invalid={invalid && !other}
        className="h-11 rounded-[10px] border-[#d4d5d2] px-3.5 text-[15px]"
        itemClassName="min-h-11 text-[14px]"
      />
      {other && (
        <div>
          <label htmlFor={`${id}-other`} className="mb-1.5 block text-[14px] font-medium text-neutral-900">
            Name of the office
          </label>
          <Input
            id={`${id}-other`}
            autoFocus={value === ""}
            placeholder="e.g. Business Permits and Licensing Office"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            invalid={invalid}
            aria-describedby={describedBy}
            className="h-11 rounded-[10px] border-[#d4d5d2] px-3.5 text-[15px] text-neutral-900"
          />
        </div>
      )}
    </div>
  );
}
