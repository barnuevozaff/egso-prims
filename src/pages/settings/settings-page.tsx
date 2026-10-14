import * as React from "react";
import {
  Building2,
  CalendarClock,
  Hash,
  Package,
  RotateCcw,
  Save,
  ShieldAlert,
  ShoppingCart,
} from "lucide-react";

import {
  Button,
  Caption,
  ContainerCard,
  Field,
  Input,
  PageHeader,
  PageTransition,
  SectionTitle,
  SelectField,
  Skeleton,
  Switch,
  Textarea,
  toast,
} from "@/components";
import { setConfigValues } from "@/features/config/api";
import { useConfiguration } from "@/features/config/hooks";
import {
  CONFIG_DEFINITIONS,
  type ConfigCategory,
  type ConfigDefinition,
  type ConfigValue,
} from "@/features/config/types";

/**
 * Settings.
 *
 * Four sections for the four modules the office runs, and one for the details
 * every module's printed output shares. Nothing else: a setting appears here
 * because something reads it, and the note under each field says what.
 *
 * The page owns no configuration logic. Fields are rendered from
 * CONFIG_DEFINITIONS and written through the existing config service, so
 * adding a setting means adding a definition — not editing this file.
 */

interface SectionSpec {
  category: ConfigCategory;
  /** Heading shown, when the module's name differs from its stored category. */
  title?: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

/** The four modules, in the order they appear in the sidebar. */
const MODULE_SECTIONS: SectionSpec[] = [
  {
    category: "Procurement",
    icon: ShoppingCart,
    description:
      "Choices offered on Purchase Requests and Purchase Orders — the units an item can be counted in, and the fund a new request starts against.",
  },
  {
    category: "Inventory",
    icon: Package,
    description:
      "Where stock is kept, and the points at which an item is reported as running low or critical.",
  },
  {
    category: "Facility Reservation",
    icon: CalendarClock,
    description:
      "The hours a municipal facility can be booked for, and how far apart the selectable times are.",
  },
  {
    // The stored category keeps its old name; renaming it would orphan the saved values.
    category: "Violation Management",
    title: "Ordinance Violations",
    icon: ShieldAlert,
    description:
      "The offences the office issues tickets for, how a fine may be settled, and the standard amount a new violation starts at.",
  },
];

/** Shared by all four: the letterhead, and how document numbers are formed. */
const OFFICE_SECTIONS: SectionSpec[] = [
  {
    category: "General",
    icon: Building2,
    description:
      "The office's identity as it appears on every printed document and on the login screen.",
  },
  {
    category: "Document Numbering",
    icon: Hash,
    description:
      "How PR, PO, RIS, FR and VT numbers are formed. Read by the database when a number is issued, so a change applies to every module at once.",
  },
];

const asText = (v: ConfigValue): string =>
  v === null || v === undefined
    ? ""
    : typeof v === "object"
      ? JSON.stringify(v, null, 2)
      : String(v);

/** A list setting is edited one option per line; blank lines are dropped. */
const linesToList = (raw: string): string[] =>
  raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const listToLines = (v: ConfigValue): string =>
  Array.isArray(v) ? v.join("\n") : typeof v === "string" ? v : "";

export function SettingsPage() {
  const { loading, refresh, get } = useConfiguration(React.useMemo(() => ({}), []));
  const [draft, setDraft] = React.useState<Record<string, ConfigValue>>({});
  const [saving, setSaving] = React.useState<string | null>(null);

  const fieldId = (d: ConfigDefinition) => `${d.category}::${d.key}`;

  /** Current value: the unsaved edit when present, otherwise the stored one. */
  const valueOf = React.useCallback(
    (d: ConfigDefinition): ConfigValue => {
      const id = fieldId(d);
      return id in draft ? draft[id] : get(d.category, d.key);
    },
    [draft, get],
  );

  const setDraftValue = (d: ConfigDefinition, value: ConfigValue) =>
    setDraft((prev) => ({ ...prev, [fieldId(d)]: value }));

  const sectionDefs = (category: string) =>
    CONFIG_DEFINITIONS.filter((d) => d.category === category);

  /** Unsaved edits within one section. */
  const dirtyIn = (category: string) =>
    sectionDefs(category).filter((d) => fieldId(d) in draft);

  const saveSection = async (category: string) => {
    const changed = dirtyIn(category);
    if (changed.length === 0) return;
    setSaving(category);
    try {
      await setConfigValues(
        changed.map((d) => ({ category: d.category, key: d.key, value: valueOf(d) })),
      );
      setDraft((prev) => {
        const next = { ...prev };
        for (const d of changed) delete next[fieldId(d)];
        return next;
      });
      toast.success(`${MODULE_SECTIONS.find((m) => m.category === category)?.title ?? category} settings saved`);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save settings");
    }
    setSaving(null);
  };

  const resetSection = (category: string) =>
    setDraft((prev) => {
      const next = { ...prev };
      for (const d of sectionDefs(category)) delete next[fieldId(d)];
      return next;
    });

  /* ---------------- field renderer ---------------- */

  const renderField = (d: ConfigDefinition) => {
    const value = valueOf(d);

    if (d.kind === "boolean") {
      return (
        <div
          key={d.key}
          className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 p-3.5"
        >
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-neutral-800">{d.label}</div>
            {d.note && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">{d.note}</p>
            )}
          </div>
          <Switch
            checked={value === true}
            onCheckedChange={(checked) => setDraftValue(d, checked)}
          />
        </div>
      );
    }

    if (d.kind === "list") {
      const lines = listToLines(value);
      const count = linesToList(lines).length;
      return (
        <Field
          key={d.key}
          label={d.label}
          helper={d.note}
          className="sm:col-span-2"
        >
          <Textarea
            rows={Math.min(12, Math.max(4, count + 1))}
            placeholder="One option per line"
            value={lines}
            onChange={(e) => setDraftValue(d, linesToList(e.target.value))}
          />
          <Caption as="p" className="mt-1">
            {count} option{count === 1 ? "" : "s"} · one per line
          </Caption>
        </Field>
      );
    }

    if (d.kind === "select") {
      return (
        <Field key={d.key} label={d.label} helper={d.note}>
          <SelectField
            options={(d.options ?? []).map((o) => ({ value: o, label: o }))}
            value={typeof value === "string" && value ? value : undefined}
            onChange={(v) => setDraftValue(d, v)}
          />
        </Field>
      );
    }

    if (d.kind === "number") {
      return (
        <Field key={d.key} label={d.label} helper={d.note}>
          <Input
            type="number"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) =>
              setDraftValue(d, e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </Field>
      );
    }

    return (
      <Field key={d.key} label={d.label} helper={d.note}>
        <Input
          value={asText(value)}
          // A cleared text field stores an empty string rather than null: it
          // reads back identically and avoids relying on a nullable column.
          onChange={(e) => setDraftValue(d, e.target.value)}
        />
      </Field>
    );
  };

  /** One settings card: what it controls, its fields, and its save bar. */
  const renderSection = ({ category, title, icon: Icon, description }: SectionSpec) => {
    const dirty = dirtyIn(category);
    return (
      <ContainerCard key={category} className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
              <Icon className="h-3.5 w-3.5 text-neutral-600" />
            </span>
            <div className="min-w-0">
              <SectionTitle as="h3">{title ?? category}</SectionTitle>
              <p className="mt-0.5 max-w-2xl text-[11.5px] leading-relaxed text-neutral-500">
                {description}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {dirty.length > 0 && (
              <Caption as="span">
                {dirty.length} unsaved change{dirty.length === 1 ? "" : "s"}
              </Caption>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => resetSection(category)}
              disabled={dirty.length === 0}
            >
              <RotateCcw />
              Reset
            </Button>
            <Button
              size="xs"
              onClick={() => void saveSection(category)}
              loading={saving === category}
              disabled={dirty.length === 0}
            >
              <Save />
              Save Changes
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {sectionDefs(category).map(renderField)}
          </div>
        )}
      </ContainerCard>
    );
  };

  return (
    <PageTransition className="space-y-4">
      <PageHeader
        title="Settings"
        description="System configuration for the modules used by the General Services Office."
      />

      <div className="space-y-4">{MODULE_SECTIONS.map(renderSection)}</div>

      <div className="space-y-4 border-t border-neutral-200 pt-4">
        <div>
          <SectionTitle as="h2">Office &amp; Documents</SectionTitle>
          <p className="mt-0.5 text-[11.5px] text-neutral-500">
            Shared by all four modules: the letterhead their printed output carries, and the
            numbering their records are issued under.
          </p>
        </div>
        {OFFICE_SECTIONS.map(renderSection)}
      </div>
    </PageTransition>
  );
}
