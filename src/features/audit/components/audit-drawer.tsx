import * as React from "react";
import { format } from "date-fns";
import { Globe, Monitor, Printer } from "lucide-react";

import {
  ApprovalTimeline,
  Button,
  Caption,
  DocumentNumber,
  Drawer,
  DrawerActions,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  OverlineLabel,
  Skeleton,
  SkeletonText,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  type ApprovalTimelineStep,
} from "@/components";
import { getAuditEntry, listRelatedEntries, listSessionEntries } from "@/features/audit/api";
import type { AuditEntry } from "@/features/audit/types";
import { departmentByCode } from "@/features/purchase-requests/types";
import { HistoryFeed, type HistoryEntry } from "@/features/shared/history-feed";
import { reportLoadFailure } from "@/features/shared/load-guard";

const fmt = (iso: string) => format(new Date(iso), "d MMM yyyy · h:mm:ss a");

/**
 * Renders a change value. Payloads that parse as JSON are pretty-printed in a
 * monospace block; everything else renders as the plain sentence the trigger
 * wrote (e.g. "Status: Approved").
 */
function ChangeValue({ value, emphasis }: { value?: string; emphasis?: boolean }) {
  const pretty = React.useMemo(() => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return null;
    }
  }, [value]);

  if (!value) return <div className="mt-1 text-[12.5px] text-neutral-400">—</div>;

  if (pretty) {
    return (
      <pre className="mt-1.5 max-h-56 overflow-auto rounded-md bg-white/70 p-2.5 font-mono text-[11px] leading-relaxed text-neutral-700">
        {pretty}
      </pre>
    );
  }

  return (
    <div
      className={
        "mt-1 text-[12.5px] " +
        (emphasis ? "font-medium text-neutral-900" : "text-neutral-600")
      }
    >
      {value}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <OverlineLabel>{label}</OverlineLabel>
      <div className="mt-0.5 text-[12.5px] text-neutral-800">{children}</div>
    </div>
  );
}

/** Right slide-over showing one audit entry in full forensic detail. */
export function AuditDrawer({
  entryId,
  open,
  onOpenChange,
}: {
  entryId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [entry, setEntry] = React.useState<AuditEntry | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [related, setRelated] = React.useState<AuditEntry[]>([]);
  const [session, setSession] = React.useState<AuditEntry[]>([]);

  React.useEffect(() => {
    if (!open || !entryId) {
      setEntry(null);
      return;
    }
    let live = true;
    setLoading(true);
    void getAuditEntry(entryId)
      .then(async (e) => {
        if (!live) return;
        setEntry(e);
        setLoading(false);
        if (e) {
          const [rel, ses] = await Promise.all([listRelatedEntries(e), listSessionEntries(e)]);
          if (live) {
            setRelated(rel);
            setSession(ses);
          }
        }
      })
      .catch((e) => {
        if (!live) return;
        setLoading(false);
        reportLoadFailure(e, "that audit entry");
      });
    return () => {
      live = false;
    };
  }, [open, entryId]);

  const timeline: ApprovalTimelineStep[] = related.map((e) => ({
    label: e.action,
    status: e.id === entry?.id ? "current" : "approved",
    time: fmt(e.timestamp),
    person: { name: e.user, office: departmentByCode(e.departmentCode).name },
    remarks: e.remarks,
  }));

  const sessionHistory: HistoryEntry[] = session.map((e) => ({
    id: e.id,
    kind: e.action.startsWith("Login") || e.action === "Logout" ? "create" : "status",
    text: `${e.action}${e.documentNumber ? ` · ${e.documentNumber}` : ""} — ${e.response}`,
    at: e.timestamp,
  }));

  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="2xl">
      {loading || !entry ? (
        <div className="p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-56" />
          <SkeletonText lines={6} className="mt-6" />
        </div>
      ) : (
        <>
          <DrawerHeader
            title={entry.action}
            description={`${entry.id} · ${entry.module}`}
            onClose={() => onOpenChange(false)}
          >
            <div className="mt-2 flex items-center gap-1.5">
              <StatusBadge status={entry.severity} />
              <StatusBadge status={entry.status} />
            </div>
          </DrawerHeader>
          <DrawerBody>
            <div className="space-y-5">
              {/* Overview */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Timestamp">{fmt(entry.timestamp)}</Field>
                <Field label="User">
                  {entry.user}
                  <span className="block text-[11px] text-neutral-500">{entry.userRole}</span>
                </Field>
                <Field label="Email">
                  {entry.email ? (
                    <span className="break-all text-neutral-700">{entry.email}</span>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </Field>
                <Field label="Department">{departmentByCode(entry.departmentCode).name}</Field>
                <Field label="Module">{entry.module}</Field>
                <Field label="Action Performed">{entry.action}</Field>
                <Field label="Affected Record">
                  {entry.documentNumber ? (
                    <DocumentNumber value={entry.documentNumber} chipColor="bg-neutral-800" />
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </Field>
                <Field label="Record ID">
                  <span className="break-all font-mono text-[11.5px] text-neutral-600">
                    {entry.id}
                  </span>
                </Field>
                <div className="col-span-2">
                  <Field label="System Response">{entry.response}</Field>
                </div>
                {entry.remarks && (
                  <div className="col-span-2">
                    <Field label="Remarks">{entry.remarks}</Field>
                  </div>
                )}
              </div>

              {/* Change comparison — JSON payloads are pretty-printed */}
              {(entry.previousValue || entry.updatedValue) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <section className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3.5">
                    <OverlineLabel>Previous Value</OverlineLabel>
                    <ChangeValue value={entry.previousValue} />
                  </section>
                  <section className="rounded-lg border border-(--tone-settled)/25 bg-(--tone-settled-tint) p-3.5">
                    <OverlineLabel>Updated Value</OverlineLabel>
                    <ChangeValue value={entry.updatedValue} emphasis />
                  </section>
                </div>
              )}

              {/* Client info */}
              <section className="rounded-lg border border-neutral-200 p-3.5">
                <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-neutral-900">
                  <Monitor className="h-3.5 w-3.5 text-neutral-500" />
                  Client Information
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <Field label="IP Address">
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <Globe className="h-3 w-3 text-neutral-400" />
                      {entry.ip}
                    </span>
                  </Field>
                  <Field label="Session ID">
                    <span className="tabular-nums">{entry.sessionId}</span>
                  </Field>
                  <Field label="Browser">{entry.browser}</Field>
                  <Field label="Operating System">{entry.os}</Field>
                </div>
              </section>

              {/* The record's activity and the session's; reviewer comments are not shown. */}
              <Tabs defaultValue="timeline">
                <TabsList className="bg-neutral-100 group-data-[orientation=horizontal]/tabs:h-auto">
                  <TabsTrigger value="timeline" className="min-h-11 px-3.5 text-[12.5px]">
                    Record timeline
                  </TabsTrigger>
                  <TabsTrigger value="history" className="min-h-11 px-3.5 text-[12.5px]">
                    Session history
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="timeline" className="pt-3">
                  {timeline.length > 0 ? (
                    <>
                      <Caption as="p" className="mb-3">
                        All recorded activity on {entry.documentNumber}.
                      </Caption>
                      <ApprovalTimeline steps={timeline} />
                    </>
                  ) : (
                    <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-[11.5px] text-neutral-500">
                      This event is not linked to a document record.
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="history" className="pt-3">
                  <Caption as="p" className="mb-3">
                    Activity within session {entry.sessionId}.
                  </Caption>
                  <HistoryFeed entries={sessionHistory} />
                </TabsContent>
              </Tabs>
            </div>
          </DrawerBody>
          <DrawerFooter>
            <DrawerActions>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  toast.info(`Preparing ${entry.id} for printing`);
                  window.print();
                }}
              >
                <Printer />
                Print
              </Button>
            </DrawerActions>
          </DrawerFooter>
        </>
      )}
    </Drawer>
  );
}
