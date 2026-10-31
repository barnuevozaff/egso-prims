import * as React from "react";
import {
  Ban,
  Download,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Printer,
  Receipt,
  Archive,
  ArchiveRestore,
  ScrollText,
} from "lucide-react";

import {
  Button,
  Caption,
  Drawer,
  DrawerActions,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  EmptyState,
  OverlineLabel,
  SectionTitle,
  Skeleton,
  SkeletonText,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeaderRow,
  TableRow,
  toast,
} from "@/components";
import { formatPHP } from "@/lib/format";
import { archiveViolator, cancelViolation } from "@/features/violations/api";
import { useAuth } from "@/features/auth/auth-context";
import { VoidRecordDialog } from "@/features/shared/void-record";
import { formatDate, orDash } from "@/features/violations/lib";
import type { Violation, ViolatorProfile } from "@/features/violations/types";

/** One figure in the profile summary band. */
function Summary({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "settled" | "process";
}) {
  const toneClass =
    tone === "settled"
      ? "text-(--tone-settled)"
      : tone === "process"
        ? "text-(--tone-process)"
        : "text-neutral-900";
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <OverlineLabel>{label}</OverlineLabel>
      <div className={`mt-0.5 text-[16px] font-semibold tabular-nums tracking-tight ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

/**
 * The violator profile: who they are, what they owe, and every violation
 * recorded against them. Opened from the profile list — this is the module's
 * detail view, not a ticket view.
 */
export function ViolatorDrawer({
  profile,
  open,
  onOpenChange,
  loading = false,
  onEditProfile,
  onAddViolation: addViolation,
  onEditViolation,
  onRecordPayment,
  onPrint,
  onExport,
  onChanged,
}: {
  profile: ViolatorProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
  onEditProfile: (profile: ViolatorProfile) => void;
  onAddViolation: (profile: ViolatorProfile) => void;
  onEditViolation: (profile: ViolatorProfile, violation: Violation) => void;
  onRecordPayment: (profile: ViolatorProfile, violation: Violation) => void;
  onPrint: (profile: ViolatorProfile) => void;
  onExport: (profile: ViolatorProfile) => void;
  onChanged?: () => void;
}) {
  const [pendingCancel, setPendingCancel] = React.useState<Violation | null>(null);
  const [archiving, setArchiving] = React.useState(false);
  const { user } = useAuth();
  // Archiving a profile is the Administrator's (approved 2026-10-21).
  const isAdmin = user?.role === "Administrator";
  // An archived profile takes no new tickets until an Administrator restores
  // it; recording one never restores it (approved 2026-10-21).
  const onAddViolation = profile?.violator.archived ? undefined : addViolation;

  const toggleArchive = async (archived: boolean) => {
    if (!profile) return;
    setArchiving(true);
    try {
      await archiveViolator(profile.violator.id, archived);
      toast.success(archived ? "Profile archived — its tickets and history are kept" : "Profile restored");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to change the profile");
    }
    setArchiving(false);
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} size="wide">
        {!profile || loading ? (
          <div className="p-5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-3 w-64" />
            <SkeletonText lines={6} className="mt-6" />
          </div>
        ) : (
          <>
            <DrawerHeader
              title={profile.violator.fullName}
              description="Violator profile · violation and payment history"
              onClose={() => onOpenChange(false)}
            >
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status={profile.status} />
                {profile.violator.archived && (
                  <>
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#5b606b]">Archived</span>
                    <Caption className="text-[11.5px]">Restore it to record new violations.</Caption>
                  </>
                )}
                <Caption>
                  {profile.totalViolations} violation
                  {profile.totalViolations === 1 ? "" : "s"} on record
                </Caption>
              </div>
            </DrawerHeader>

            <DrawerBody>
              <div className="space-y-5">
                {/* Who they are */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <div>
                    <OverlineLabel>Full Name</OverlineLabel>
                    <div className="mt-0.5 text-[12.5px] text-neutral-800">
                      {profile.violator.fullName}
                    </div>
                  </div>
                  <div>
                    <OverlineLabel>Contact Number</OverlineLabel>
                    <div className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] text-neutral-800">
                      <Phone className="h-3 w-3 text-neutral-400" />
                      {orDash(profile.violator.contactNumber)}
                    </div>
                  </div>
                  <div>
                    <OverlineLabel>Email Address</OverlineLabel>
                    <div className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] text-neutral-800">
                      <Mail className="h-3 w-3 text-neutral-400" />
                      {orDash(profile.violator.email)}
                    </div>
                  </div>
                  <div className="col-span-3">
                    <OverlineLabel>Address</OverlineLabel>
                    <div className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] text-neutral-800">
                      <MapPin className="h-3 w-3 text-neutral-400" />
                      {orDash(profile.violator.address)}
                    </div>
                  </div>
                </div>

                {/* What they owe — recomputes the moment a payment is recorded */}
                <section className="grid grid-cols-3 gap-3 lg:grid-cols-6">
                  <Summary label="Total Violations" value={String(profile.totalViolations)} />
                  <Summary label="Paid" value={String(profile.paidCount)} tone="settled" />
                  <Summary
                    label="Pending"
                    value={String(profile.pendingCount)}
                    tone={profile.pendingCount > 0 ? "process" : "neutral"}
                  />
                  <Summary
                    label="Total Assessed"
                    value={formatPHP(profile.totalAmount, { decimals: 2 })}
                  />
                  <Summary
                    label="Total Amount Paid"
                    value={formatPHP(profile.totalPaid, { decimals: 2 })}
                    tone="settled"
                  />
                  <Summary
                    label="Outstanding Balance"
                    value={formatPHP(profile.outstandingBalance, { decimals: 2 })}
                    tone={profile.outstandingBalance > 0 ? "process" : "settled"}
                  />
                </section>

                {/* Violation history */}
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <SectionTitle as="h3">Violation History</SectionTitle>
                    {onAddViolation && (
                      <Button variant="secondary" size="xs" onClick={() => onAddViolation(profile)}>
                        <Plus />
                        Add Violation
                      </Button>
                    )}
                  </div>

                  {profile.violations.length === 0 ? (
                    <EmptyState
                      icon={ScrollText}
                      title="No violation records found."
                      description="This profile has no violations on record yet."
                      action={
                        onAddViolation
                          ? { label: "Add Violation", onClick: () => onAddViolation(profile) }
                          : undefined
                      }
                    />
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-neutral-200">
                      <Table minWidth={0} className="min-w-full">
                        <TableHeader>
                          <TableHeaderRow>
                            <TableHead first>Violation No.</TableHead>
                            <TableHead>Violation</TableHead>
                            <TableHead>Apprehended By</TableHead>
                            <TableHead>Date Issued</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Payment Status</TableHead>
                            <TableHead>Payment Date</TableHead>
                            <TableHead>Receipt/OR No.</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableHeaderRow>
                        </TableHeader>
                        <TableBody>
                          {profile.violations.map((v) => (
                            <TableRow key={v.id}>
                              {/* A document number is one token: never broken across lines (the table scrolls instead). */}
                              <TableCell first className="whitespace-nowrap font-medium text-neutral-900">
                                {v.violationNo}
                                {/* The paper serial identifies the same ticket,
                                    so it sits with the system's number. */}
                                {v.citationNo && (
                                  <span className="mt-0.5 block text-[11.5px] font-normal tabular-nums text-neutral-500">
                                    {v.citationNo}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span className="block max-w-[200px] truncate">
                                  {v.violationType}
                                </span>
                                {v.description && (
                                  <span className="mt-0.5 block max-w-[200px] truncate text-[11.5px] text-neutral-500">
                                    {v.description}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-neutral-600">
                                {orDash(v.apprehendedBy)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-neutral-600">
                                {formatDate(v.dateIssued)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-neutral-900">
                                {formatPHP(v.amount, { decimals: 2 })}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={v.paymentStatus} />
                                {v.paymentStatus === "Cancelled" && v.cancelReason && (
                                  <Caption className="mt-0.5 block max-w-[220px] whitespace-normal text-[10.5px]">
                                    {v.cancelReason}
                                    {v.cancelledBy ? ` — ${v.cancelledBy}` : ""}
                                    {v.cancelledAt ? `, ${formatDate(v.cancelledAt)}` : ""}
                                  </Caption>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-neutral-600">
                                {v.paymentDate ? formatDate(v.paymentDate) : "—"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap tabular-nums text-neutral-600">
                                {orDash(v.orNumber)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {v.paymentStatus === "Pending" ? (
                                    <>
                                      <Button
                                        size="xs"
                                        onClick={() => onRecordPayment(profile, v)}
                                      >
                                        <Receipt />
                                        Record Payment
                                      </Button>
                                      <Button
                                        variant="danger"
                                        size="xs"
                                        onClick={() => setPendingCancel(v)}
                                      >
                                        <Ban />
                                        Cancel
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      variant="secondary"
                                      size="xs"
                                      onClick={() => onEditViolation(profile, v)}
                                    >
                                      <FileText />
                                      View
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </section>
              </div>
            </DrawerBody>

            <DrawerFooter>
              <DrawerActions>
                <Button variant="ghost" onClick={() => onEditProfile(profile)}>
                  <Pencil />
                  Edit Profile
                </Button>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    loading={archiving}
                    onClick={() => void toggleArchive(!profile.violator.archived)}
                  >
                    {profile.violator.archived ? <ArchiveRestore /> : <Archive />}
                    {profile.violator.archived ? "Restore Profile" : "Archive Profile"}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => onExport(profile)}
                  disabled={profile.violations.length === 0}
                >
                  <Download />
                  Export
                </Button>
                <Button variant="secondary" onClick={() => onPrint(profile)}>
                  <Printer />
                  Print
                </Button>
                {onAddViolation && (
                  <Button onClick={() => onAddViolation(profile)}>
                    <Plus />
                    Add Violation
                  </Button>
                )}
              </DrawerActions>
            </DrawerFooter>
          </>
        )}
      </Drawer>

      <VoidRecordDialog
        open={!!pendingCancel}
        onOpenChange={(o) => !o && setPendingCancel(null)}
        title={`Cancel ${pendingCancel?.violationNo ?? "this violation"}?`}
        description="The ticket keeps its number and stays on the profile as cancelled, with your reason, your name and the time. It stops counting toward the assessed total."
        confirmLabel="Cancel Violation"
        doneMessage="Violation cancelled"
        onVoid={(reason) => cancelViolation(pendingCancel!.id, reason)}
        onDone={() => {
          setPendingCancel(null);
          onChanged?.();
        }}
      />
    </>
  );
}
