import * as React from "react";
import { Landmark, Pencil, Plus, Search, Trash2 } from "lucide-react";

import {
  Button,
  ConfirmationModal,
  ContainerCard,
  DeleteModal,
  EmptyState,
  ErrorState,
  Input,
  SectionTitle,
  Skeleton,
  toast,
} from "@/components";
import { addOffice, removeOffice, renameOffice, type Office } from "@/features/offices/api";
import { setOffices, useOffices } from "@/features/offices/use-offices";

/**
 * Settings → Office / Department Management (29 Oct 2026): the office
 * directory every Office / Department field and filter offers, on the admin
 * site and the public portal. Adding, renaming or removing an office here
 * changes those lists at once; no code change or redeploy.
 *
 * Removing takes an office off the lists only. Documents already filed under
 * it keep its name, and so do documents filed before a rename.
 */

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const sameName = (a: string, b: string) => tidy(a).toLowerCase() === tidy(b).toLowerCase();

type Editing = { mode: "add" } | { mode: "rename"; office: Office };

export function OfficeDirectorySection() {
  const { offices, status, reload } = useOffices();
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [name, setName] = React.useState("");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<Office | null>(null);
  const [busy, setBusy] = React.useState(false);

  const shown = React.useMemo(() => {
    const q = tidy(query).toLowerCase();
    return q ? offices.filter((o) => o.name.toLowerCase().includes(q)) : offices;
  }, [offices, query]);

  const openEditor = (next: Editing) => {
    setEditing(next);
    setName(next.mode === "rename" ? next.office.name : "");
    setNameError(null);
  };

  const save = async () => {
    if (!editing || busy) return;
    const value = tidy(name);
    if (value.length < 2) return setNameError("Enter the office's name.");
    if (value.length > 120) return setNameError("An office's name is at most 120 characters.");
    const current = editing.mode === "rename" ? editing.office : null;
    if (current && value === current.name) return setEditing(null);
    if (offices.some((o) => o.id !== current?.id && sameName(o.name, value))) {
      return setNameError(`“${value}” is already on the list.`);
    }
    setBusy(true);
    try {
      setOffices(current ? await renameOffice(current.id, value) : await addOffice(value));
      toast.success(current ? `Renamed to ${value}` : `${value} added to the office list`);
      setEditing(null);
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "The office could not be saved. Please try again.");
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try {
      setOffices(await removeOffice(removing.id));
      toast.success(`${removing.name} removed from the office list`);
      setRemoving(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The office could not be removed. Please try again.");
    }
    setBusy(false);
  };

  return (
    <ContainerCard className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
            <Landmark className="h-3.5 w-3.5 text-neutral-600" />
          </span>
          <div className="min-w-0">
            <SectionTitle as="h3">Office / Department Management</SectionTitle>
            <p className="mt-0.5 max-w-2xl text-[11.5px] leading-relaxed text-neutral-500">
              The offices every Office / Department field offers, on this site and on the public
              portal. A change applies at once. Removing an office takes it off the lists; documents
              already filed under it keep its name.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => openEditor({ mode: "add" })} disabled={status !== "ready"}>
          <Plus />
          Add Office
        </Button>
      </div>

      {status === "loading" && offices.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      ) : status === "error" && offices.length === 0 ? (
        <ErrorState
          title="The office list could not be loaded"
          description="Check the connection, then try again."
          action={{ label: "Try again", onClick: reload }}
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <label htmlFor="office-search" className="sr-only">
                Search offices
              </label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8f98]"
              />
              <Input
                id="office-search"
                type="search"
                placeholder="Search offices"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <p role="status" className="text-[12px] tabular-nums text-[#5b606b]">
              {query.trim() ? `${shown.length} of ${offices.length} offices` : `${offices.length} offices`}
            </p>
          </div>

          {shown.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No office matches"
              description={`Nothing on the list contains “${tidy(query)}”.`}
              action={{ label: "Clear search", onClick: () => setQuery("") }}
            />
          ) : (
            <ul className="divide-y divide-[#f0f0ee] rounded-[10px] border border-[#e6e6e3]">
              {shown.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-1.5">
                  <span className="min-w-0 py-2 text-[13.5px] text-neutral-900">{o.name}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 sm:h-9"
                      aria-label={`Edit ${o.name}`}
                      onClick={() => openEditor({ mode: "rename", office: o })}
                    >
                      <Pencil />
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="h-11 sm:h-9"
                      aria-label={`Remove ${o.name}`}
                      onClick={() => setRemoving(o)}
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ConfirmationModal
        open={!!editing}
        onOpenChange={(open) => !open && !busy && setEditing(null)}
        icon={editing?.mode === "rename" ? Pencil : Plus}
        title={editing?.mode === "rename" ? "Edit office" : "Add an office"}
        description={
          editing?.mode === "rename"
            ? "Every office list shows the new name. Documents already filed keep the name they were filed under."
            : "It appears at the end of every office list, on this site and on the public portal."
        }
        confirmLabel={editing?.mode === "rename" ? "Save" : "Add Office"}
        loading={busy}
        onConfirm={() => void save()}
      >
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor="office-name" className="mb-1.5 block text-[12.5px] font-medium text-neutral-900">
            Office or department name
          </label>
          <Input
            id="office-name"
            autoFocus
            maxLength={120}
            placeholder="e.g. Office of the Municipal Accountant"
            value={name}
            invalid={!!nameError}
            aria-describedby={nameError ? "office-name-error" : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
          />
          {nameError && (
            <p id="office-name-error" role="alert" className="mt-1.5 text-[12px] text-red-700">
              {nameError}
            </p>
          )}
        </form>
      </ConfirmationModal>

      <DeleteModal
        open={!!removing}
        onOpenChange={(open) => !open && !busy && setRemoving(null)}
        title={removing ? `Remove ${removing.name}?` : "Remove office?"}
        description="It leaves every office list at once, on this site and on the public portal. Documents already filed under it keep its name; nothing is deleted."
        confirmLabel="Remove office"
        loading={busy}
        onConfirm={() => void remove()}
      />
    </ContainerCard>
  );
}
