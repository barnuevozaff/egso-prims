import * as React from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  addMonths,
  endOfMonth,
  format,
  getDay,
  getDaysInMonth,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";

import { Input, Spinner, Textarea } from "@/components";
import { useConfigNumber, useConfigText } from "@/features/config/use-module-config";
import { listBookingsBetween, type ReservationDraftInput } from "@/features/reservations/api";
import {
  buildTimeSlots,
  equipmentName,
  facilityName,
  formatTime,
  normaliseFacility,
  sameFacility,
  timesOverlap,
  type Reservation,
} from "@/features/reservations/types";
import { resFormSchema, type ResFormValues } from "@/features/reservations/components/res-form/schema";
import { OfficeField } from "@/features/shared/office-field";
import { reportLoadFailure } from "@/features/shared/load-guard";
import { LeaveGuard } from "@/features/shared/leave-guard";
import { cn } from "@/lib/utils";

/**
 * The Facility Reservation form: one page, approved 15 Oct 2026 (canvas
 * "Portal Home Redesign", Facility Reservation). It replaced a four-step
 * wizard and the month calendar that sat above it on the portal; attachments
 * were dropped. The portal and the admin's create and edit pages share it.
 *
 * Facility and equipment are typed by hand (owner's call: the office has not
 * settled either list). Availability is part of the form: days that already
 * have a booking for the typed facility carry a dot, and booked times cannot
 * be picked. The server checks the slot again on submit.
 */

const MONO = "font-['Geist_Mono',ui-monospace,monospace]";
const FIELD = "h-11 rounded-[10px] border-[#d4d5d2] px-3.5 text-[15px] text-neutral-900";
const CELL = "h-10 rounded-lg border-[#d4d5d2] px-3 text-[14px] text-neutral-900";
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const emptyEquipment = {
  equipmentId: "",
  quantity: 1,
  remarks: "",
};

export interface ResFormProps {
  /** Existing reservation when editing; omit for create. */
  initial?: Reservation;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (input: ReservationDraftInput) => void | Promise<void>;
  onCancel: () => void;
  /** Told when the form gains or loses unsaved changes: the record's page holds its actions until they are saved (30 Oct 2026). */
  onDirtyChange?: (dirty: boolean) => void;
}

type FormApi = ReturnType<typeof useForm<ResFormValues>>;

/** A day's bookings as [start, end) pairs, for the slot grid and the list. */
type Booking = Pick<Reservation, "id" | "resNumber" | "status" | "startTime" | "endTime" | "date" | "facilityId">;

export function ResForm({ initial, submitLabel, submitting, onSubmit, onCancel, onDirtyChange }: ResFormProps) {
  const form = useForm<ResFormValues>({
    resolver: zodResolver(resFormSchema),
    mode: "onTouched",
    // The date, the time slots and the office are not plain inputs, so the
    // form finds the first error itself (focusFirstError) in page order.
    shouldFocusError: false,
    defaultValues: initial
      ? {
          borrower: initial.borrower,
          departmentCode: initial.departmentCode,
          contactNumber: initial.contactNumber,
          purpose: initial.purpose,
          // A booking from the old register opens on the facility's name.
          facilityId: facilityName(initial.facilityId),
          date: new Date(`${initial.date}T00:00:00`),
          startTime: initial.startTime,
          endTime: initial.endTime,
          equipment: initial.equipment.map(({ equipmentId, quantity, remarks }) => ({
            equipmentId: equipmentName(equipmentId),
            quantity,
            remarks: remarks ?? "",
          })),
        }
      : {
          borrower: "",
          departmentCode: "",
          contactNumber: "",
          purpose: "",
          facilityId: "",
          date: startOfDay(new Date()),
          startTime: "",
          endTime: "",
          equipment: [],
        },
  });

  // Every Pending/Approved booking in the month on screen, for any facility;
  // narrowed to the typed facility below, so typing does not refetch.
  const [month, setMonth] = React.useState(() => startOfMonth(form.getValues("date")));
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = React.useState(true);
  React.useEffect(() => {
    let live = true;
    setLoadingBookings(true);
    listBookingsBetween(format(month, "yyyy-MM-dd"), format(endOfMonth(month), "yyyy-MM-dd"))
      .then((rows) => {
        if (live) setBookings(rows);
      })
      .catch((e) => {
        if (live) reportLoadFailure(e, "the month's bookings");
      })
      .finally(() => {
        if (live) setLoadingBookings(false);
      });
    return () => {
      live = false;
    };
  }, [month]);

  const facility = useWatch({ control: form.control, name: "facilityId" }) ?? "";
  const facilityBookings = React.useMemo(
    () =>
      normaliseFacility(facility).length >= 3
        ? bookings.filter((b) => b.id !== initial?.id && sameFacility(b.facilityId, facility))
        : [],
    [bookings, facility, initial?.id],
  );

  const formRef = React.useRef<HTMLFormElement>(null);

  /**
   * Scrolls to the first error message on the page and focuses the control it
   * belongs to: the field, the first free time slot, or the office picker.
   * Waits a frame so the messages from this submit have rendered.
   */
  const focusFirstError = () => {
    requestAnimationFrame(() => {
      const alert = formRef.current?.querySelector<HTMLElement>('[role="alert"]');
      const box = alert?.parentElement;
      if (!alert || !box) return;
      const target = box.querySelector<HTMLElement>(
        "input:not([disabled]), textarea:not([disabled]), button:not([disabled])",
      );
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      (target ?? alert).scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      target?.focus({ preventScroll: true });
    });
  };

  const submit = form.handleSubmit(async (values) => {
    const day = format(values.date, "yyyy-MM-dd");
    const clash = facilityBookings.find(
      (b) => b.date === day && timesOverlap(values.startTime, values.endTime, b.startTime, b.endTime),
    );
    if (clash) {
      form.setError("startTime", {
        message: `This time overlaps ${clash.resNumber}. Pick a free time.`,
      });
      focusFirstError();
      return;
    }
    await onSubmit({
      facilityId: normaliseFacility(values.facilityId),
      departmentCode: values.departmentCode,
      borrower: values.borrower.trim(),
      contactNumber: values.contactNumber.trim(),
      purpose: values.purpose.trim(),
      date: day,
      startTime: values.startTime,
      endTime: values.endTime,
      equipment: values.equipment.map((row) => ({
        equipmentId: row.equipmentId.trim(),
        name: row.equipmentId.trim(),
        quantity: row.quantity,
        remarks: row.remarks?.trim() || undefined,
      })),
      // Attachments were removed from the form. On an edit an empty list keeps
      // whatever the reservation already has (see updateReservation).
      attachments: [],
    });
  }, focusFirstError);

  const err = form.formState.errors;
  const dirty = form.formState.isDirty;
  React.useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="@container w-full"
    >
      {/* Side by side only when the form itself has the width (30 Oct 2026): beside the
          admin sidebar a 1024px window left the fields under 400px. The portal, with no
          sidebar, still lays out as before. */}
      <div className="grid w-full items-start gap-6 @min-[940px]:grid-cols-[minmax(0,1fr)_340px] @min-[940px]:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Who is asking">
            <div className="grid gap-4 sm:grid-cols-2">
              <LabelledField id="res-office" label="Requesting office" error={err.departmentCode?.message}>
                <Controller
                  control={form.control}
                  name="departmentCode"
                  render={({ field }) => (
                    <OfficeField
                      id="res-office"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      invalid={!!err.departmentCode}
                      describedBy={err.departmentCode ? "res-office-error" : undefined}
                    />
                  )}
                />
              </LabelledField>
              <LabelledField id="res-borrower" label="Borrower" error={err.borrower?.message}>
                <Input
                  id="res-borrower"
                  placeholder="e.g. Ms. Anna Lorenzo"
                  autoComplete="name"
                  invalid={!!err.borrower}
                  aria-describedby={err.borrower ? "res-borrower-error" : undefined}
                  className={FIELD}
                  {...form.register("borrower")}
                />
              </LabelledField>
              <LabelledField id="res-contact" label="Contact number" error={err.contactNumber?.message}>
                <Input
                  id="res-contact"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="e.g. 0917 220 4455"
                  invalid={!!err.contactNumber}
                  aria-describedby={err.contactNumber ? "res-contact-error" : undefined}
                  className={cn(FIELD, MONO, "text-[14px]", "placeholder:font-['Geist',ui-sans-serif,system-ui,sans-serif]")}
                  {...form.register("contactNumber")}
                />
              </LabelledField>
            </div>
          </Section>

          <Section title="Where and when">
            <LabelledField
              id="res-facility"
              label="Facility"
              error={err.facilityId?.message}
              helper="Type the facility's name and where it is. If it was booked before under the same name, its booked times show below."
            >
              <Input
                id="res-facility"
                placeholder="e.g. Session Hall, 2F Municipal Hall"
                invalid={!!err.facilityId}
                aria-describedby={err.facilityId ? "res-facility-error" : "res-facility-helper"}
                className={FIELD}
                {...form.register("facilityId")}
              />
            </LabelledField>

            {/* Side by side only when this card is wide enough (30 Oct 2026). The
                window's width misled: beside the admin sidebar the card is 240px
                narrower, the slots fell into one column behind the Summary, and
                a tall empty space opened under the calendar. */}
            <div className="mt-5 @container">
              <div className="grid gap-6 @min-[33rem]:grid-cols-[minmax(316px,340px)_minmax(0,1fr)]">
                <DatePickerMonth
                  form={form}
                  month={month}
                  setMonth={setMonth}
                  bookings={facilityBookings}
                  initialDate={initial ? new Date(`${initial.date}T00:00:00`) : undefined}
                />
                <TimeSlots form={form} bookings={facilityBookings} loading={loadingBookings} />
              </div>
            </div>
          </Section>

          <Section title="The activity">
            <LabelledField id="res-purpose" label="Purpose or activity" error={err.purpose?.message}>
              <Textarea
                id="res-purpose"
                rows={2}
                placeholder="e.g. Sangguniang Bayan regular session"
                invalid={!!err.purpose}
                aria-describedby={err.purpose ? "res-purpose-error" : undefined}
                className="rounded-[10px] border-[#d4d5d2] px-3.5 py-3 text-[15px] text-neutral-900"
                {...form.register("purpose")}
              />
            </LabelledField>
          </Section>

          <EquipmentSection form={form} />
        </div>

        <SummaryPanel form={form} submitLabel={submitLabel} submitting={submitting} onCancel={onCancel} />
        <LeaveGuard active={form.formState.isDirty && !submitting} />
      </div>
    </form>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="rounded-[14px] border border-[#e4e4e1] bg-white p-5 sm:p-6">
      <h2 id={id} className="mb-4 text-[15px] font-semibold text-neutral-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Label, control, then the error or the helper, at the approved sizes. */
function LabelledField({
  id,
  label,
  error,
  helper,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-medium text-neutral-900">
        {label}
        <span className="sr-only"> (required)</span>
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13px] text-red-700">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="mt-1.5 text-[13px] text-[#5b606b]">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

/** A month of day buttons. Past days are closed; days with a booking carry a dot. */
function DatePickerMonth({
  form,
  month,
  setMonth,
  bookings,
  initialDate,
}: {
  form: FormApi;
  month: Date;
  setMonth: (d: Date) => void;
  bookings: Booking[];
  /** An edited reservation's own date stays pickable even once it is past. */
  initialDate?: Date;
}) {
  const selected = useWatch({ control: form.control, name: "date" });
  const today = startOfDay(new Date());
  const busy = new Set(bookings.map((b) => b.date));
  const lead = getDay(month);
  const days = Array.from({ length: getDaysInMonth(month) }, (_, i) =>
    new Date(month.getFullYear(), month.getMonth(), i + 1),
  );
  // Nothing to go back to before this month, unless an edit starts earlier.
  const earliest = initialDate && initialDate < today ? startOfMonth(initialDate) : startOfMonth(today);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p id="res-date-label" className="text-[14px] font-medium text-neutral-900">
          Date
        </p>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Previous month"
            disabled={isSameMonth(month, earliest) || month < earliest}
            onClick={() => setMonth(addMonths(month, -1))}
            className="grid h-11 w-11 place-items-center rounded-lg text-[#5b606b] transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>
          <span aria-live="polite" className="min-w-[104px] text-center text-[13px] font-medium text-neutral-900">
            {format(month, "MMMM yyyy")}
          </span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth(addMonths(month, 1))}
            className="grid h-11 w-11 place-items-center rounded-lg text-[#5b606b] transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div role="group" aria-labelledby="res-date-label" className="rounded-xl border border-[#e4e4e1] p-2">
        <div aria-hidden="true" className="grid grid-cols-7 pb-1 text-center text-[12px] text-[#5b606b]">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: lead }, (_, i) => (
            <span key={`blank-${i}`} aria-hidden="true" />
          ))}
          {days.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const past = d < today && !(initialDate && isSameDay(d, initialDate));
            const isSelected = !!selected && isSameDay(d, selected);
            const hasBooking = busy.has(iso);
            return (
              <button
                key={iso}
                type="button"
                disabled={past}
                aria-pressed={isSelected}
                aria-label={`${format(d, "EEEE, d MMMM")}${hasBooking ? ", has bookings" : ""}${past ? ", closed" : ""}`}
                onClick={() => form.setValue("date", d, { shouldValidate: true, shouldDirty: true })}
                className={cn(
                  "flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900",
                  MONO,
                  isSelected
                    ? "bg-neutral-900 font-semibold text-white [[data-portal]_&]:bg-(--accent-solid)"
                    : past
                      ? "cursor-not-allowed text-[#a3a6ad]"
                      : "text-neutral-900 hover:bg-neutral-100",
                  isSameDay(d, today) && !isSelected && "font-semibold",
                )}
              >
                {d.getDate()}
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1 w-1 rounded-full",
                    hasBooking ? (isSelected ? "bg-white" : "bg-[#5b606b]") : "bg-transparent",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[#5b606b]">
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#5b606b]" />
        Dot = already has a booking. Past days are closed.
      </p>
    </div>
  );
}

/**
 * The bookable window as half-hour (or configured) slots. Tap the first slot,
 * then the last; a booked slot cannot be picked or crossed.
 */
function TimeSlots({ form, bookings, loading }: { form: FormApi; bookings: Booking[]; loading: boolean }) {
  // The bookable window, as the office set it in Settings → Facility Reservation.
  const opening = useConfigText("Facility Reservation", "opening_time");
  const closing = useConfigText("Facility Reservation", "closing_time");
  const slotMinutes = useConfigNumber("Facility Reservation", "slot_minutes");
  const marks = React.useMemo(
    () => buildTimeSlots(opening, closing, slotMinutes),
    [opening, closing, slotMinutes],
  );
  // Each slot runs from one mark to the next; the closing time only ends one.
  const slots = marks.slice(0, -1).map((from, i) => ({ from, to: marks[i + 1] }));

  const [date, startTime, endTime] = useWatch({
    control: form.control,
    name: ["date", "startTime", "endTime"],
  });
  const day = date ? format(date, "yyyy-MM-dd") : "";
  const dayBookings = bookings
    .filter((b) => b.date === day)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  // Times already gone today cannot be booked.
  const now = format(new Date(), "HH:mm");
  const isToday = date ? isSameDay(date, new Date()) : false;

  const blocked = (i: number) => {
    const s = slots[i];
    return (
      (isToday && s.from < now) ||
      dayBookings.some((b) => timesOverlap(s.from, s.to, b.startTime, b.endTime))
    );
  };
  const startIdx = slots.findIndex((s) => s.from === startTime);
  const endIdx = slots.findIndex((s) => s.to === endTime);
  const hasRange = startIdx >= 0 && endIdx >= startIdx;

  const set = (from: string, to: string) => {
    form.setValue("startTime", from, { shouldValidate: true, shouldDirty: true });
    form.setValue("endTime", to, { shouldValidate: true, shouldDirty: true });
    form.clearErrors("startTime");
  };
  const pick = (i: number) => {
    if (blocked(i)) return;
    // A one-slot pick becomes the start; a later tap extends it if nothing
    // booked lies between. Anything else starts over from this slot.
    if (hasRange && startIdx === endIdx && i > startIdx) {
      for (let k = startIdx; k <= i; k++) if (blocked(k)) return set(slots[i].from, slots[i].to);
      return set(slots[startIdx].from, slots[i].to);
    }
    set(slots[i].from, slots[i].to);
  };

  const err = form.formState.errors;
  const timeError = err.startTime?.message ?? err.endTime?.message;

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p id="res-time-label" className="text-[14px] font-medium text-neutral-900">
          Time
        </p>
        <span className="flex items-center gap-2 text-[13px] text-[#5b606b]">
          {loading && <Spinner size="sm" label="Loading bookings" />}
          Tap the first slot, then the last
        </span>
      </div>
      <div
        role="group"
        aria-labelledby="res-time-label"
        aria-describedby={timeError ? "res-time-error" : undefined}
        className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5"
      >
        {slots.map((s, i) => {
          const isBlocked = blocked(i);
          const inRange = hasRange && i >= startIdx && i <= endIdx;
          const booked = isBlocked && !(isToday && s.from < now);
          return (
            <button
              key={s.from}
              type="button"
              disabled={isBlocked}
              aria-pressed={inRange}
              aria-label={`${formatTime(s.from)}${booked ? ", booked" : isBlocked ? ", already past" : inRange ? ", selected" : ""}`}
              onClick={() => pick(i)}
              className={cn(
                "flex h-11 flex-col items-center justify-center rounded-lg border text-[13px] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-1",
                MONO,
                inRange
                  ? "border-neutral-900 bg-neutral-900 text-white [[data-portal]_&]:border-(--accent-solid) [[data-portal]_&]:bg-(--accent-solid)"
                  : isBlocked
                    ? "cursor-not-allowed border-[#f4f4f2] bg-[#f4f4f2] text-[#6b707a]"
                    : "border-[#d4d5d2] bg-white text-neutral-900 hover:border-neutral-900",
              )}
            >
              {formatTime(s.from)}
              {booked && <span className="font-sans text-[11px] font-normal">Booked</span>}
            </button>
          );
        })}
      </div>
      {timeError && (
        <p id="res-time-error" role="alert" className="mt-2 text-[13px] text-red-700">
          {timeError}
        </p>
      )}
      <div className="mt-3 border-t border-[#ececea] pt-3">
        <p className="mb-1.5 text-[13px] font-medium text-neutral-900">
          Already booked on {date ? format(date, "EEEE, d MMMM") : "this day"}
        </p>
        {dayBookings.length > 0 ? (
          <ul className="list-none space-y-1">
            {dayBookings.map((b) => (
              <li key={b.id} className="flex justify-between gap-3 text-[13px] text-[#5b606b]">
                <span className={MONO}>
                  {formatTime(b.startTime)} – {formatTime(b.endTime)}
                </span>
                <span>
                  {b.resNumber} · {b.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-[#5b606b]">Nothing yet. The whole day is open.</p>
        )}
      </div>
    </div>
  );
}

function EquipmentSection({ form }: { form: FormApi }) {
  const { register, control, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "equipment" });
  const rowsError = formState.errors.equipment;
  const cols = "sm:grid-cols-[minmax(0,1fr)_88px_minmax(0,0.8fr)_40px]";

  return (
    <Section
      title={
        <span className="flex items-baseline justify-between gap-3">
          <span>
            Equipment to borrow <span className="font-normal text-[#5b606b]">Optional</span>
          </span>
          <span className="text-[13px] font-normal text-[#5b606b]">
            {fields.length === 0 ? "None" : fields.length === 1 ? "1 item" : `${fields.length} items`}
          </span>
        </span>
      }
    >
      {fields.length > 0 && (
        <>
          <div className={cn("hidden gap-2 pb-2 text-[12px] font-medium text-[#5b606b] sm:grid", cols)}>
            <span>Equipment</span>
            <span>Qty</span>
            <span>Remarks (optional)</span>
            <span />
          </div>
          <ul className="list-none space-y-2 sm:space-y-0">
            {fields.map((row, i) => {
              const rowErr = rowsError?.[i];
              return (
                <li
                  key={row.id}
                  className={cn(
                    "grid grid-cols-2 items-start gap-2 rounded-[10px] border border-[#e4e4e1] p-3 sm:items-center sm:rounded-none sm:border-0 sm:border-t sm:border-[#f0f0ee] sm:px-0 sm:py-1.5",
                    cols,
                  )}
                >
                  <div className="col-span-2 sm:col-span-1">
                    <Input
                      aria-label={`Equipment ${i + 1}`}
                      placeholder="e.g. Monoblock chairs"
                      invalid={!!rowErr?.equipmentId}
                      className={CELL}
                      {...register(`equipment.${i}.equipmentId`)}
                    />
                  </div>
                  <Input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    aria-label={`Equipment ${i + 1} quantity`}
                    placeholder="Qty"
                    invalid={!!rowErr?.quantity}
                    className={cn(CELL, MONO)}
                    {...register(`equipment.${i}.quantity`, { valueAsNumber: true })}
                  />
                  <Input
                    aria-label={`Equipment ${i + 1} remarks`}
                    placeholder="e.g. for the stage"
                    className={CELL}
                    {...register(`equipment.${i}.remarks`)}
                  />
                  <button
                    type="button"
                    aria-label={`Remove equipment ${i + 1}`}
                    onClick={() => remove(i)}
                    className="grid h-10 w-10 place-items-center justify-self-end rounded-lg text-[#5b606b] transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                  {rowErr && (
                    <p role="alert" className="col-span-2 text-[13px] text-red-700 sm:col-span-4">
                      Equipment {i + 1}: {rowErr.equipmentId?.message ?? rowErr.quantity?.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3",
          fields.length > 0 && "mt-3 border-t border-[#ececea] pt-4",
        )}
      >
        <button
          type="button"
          onClick={() => append({ ...emptyEquipment })}
          className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-dashed border-[#c9cac6] bg-white px-3.5 text-[14px] font-medium text-neutral-900 transition-colors hover:border-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add equipment
        </button>
        <span className="text-[13px] text-[#5b606b]">
          Type what you need, e.g. chairs, tables or a sound system. GSO confirms what it can lend.
        </span>
      </div>
    </Section>
  );
}

function SummaryPanel({
  form,
  submitLabel,
  submitting,
  onCancel,
}: {
  form: FormApi;
  submitLabel: string;
  submitting: boolean;
  onCancel: () => void;
}) {
  const v = useWatch({ control: form.control });
  const facility = normaliseFacility(v.facilityId ?? "");
  const equipment = v.equipment ?? [];
  const hasTime = !!v.startTime && !!v.endTime && v.startTime < v.endTime;
  const minutes = hasTime
    ? (() => {
        const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        return toMin(v.endTime!) - toMin(v.startTime!);
      })()
    : 0;
  const hours = minutes / 60;

  // The same thresholds the schema enforces, so a tick means it will pass.
  const checks = [
    {
      label: "Office, borrower and contact",
      done:
        (v.departmentCode ?? "").trim().length >= 2 &&
        (v.borrower ?? "").trim().length >= 3 &&
        (v.contactNumber ?? "").replace(/\D/g, "").length >= 7,
    },
    { label: "Facility", done: facility.length >= 3 },
    { label: "A free date and time", done: hasTime && !form.formState.errors.startTime },
    { label: "Purpose", done: (v.purpose ?? "").trim().length >= 10 },
    {
      label: equipment.length ? "Each equipment with a quantity" : "No equipment needed",
      done: equipment.every((e) => (e?.equipmentId ?? "").trim().length >= 2 && Number(e?.quantity) > 0),
    },
  ];

  return (
    <aside
      aria-label="Summary"
      className="rounded-[14px] border border-[#e4e4e1] bg-white p-5 shadow-[0_1px_2px_rgba(22,24,29,0.04),0_16px_40px_-24px_rgba(22,24,29,0.18)] sm:p-6 @min-[940px]:sticky @min-[940px]:top-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-neutral-900">Summary</h2>
        {/* How far along, at a glance; the list below says what is left. */}
        <span className={cn("text-[13px] text-[#5b606b]", MONO)}>
          {checks.filter((c) => c.done).length} of {checks.length}
        </span>
      </div>

      <p className="mt-4 text-[13px] text-[#5b606b]">Facility</p>
      {/* Still to fill reads as a quiet prompt, not as an answer. */}
      {facility ? (
        <p className="mt-1 break-words text-[17px] font-semibold tracking-[-0.01em]">{facility}</p>
      ) : (
        <p className="mt-1 text-[15px] text-[#5b606b]">No facility yet</p>
      )}

      <p className="mt-4 text-[13px] text-[#5b606b]">When</p>
      <p className="mt-1 text-[15px] font-medium text-neutral-900">
        {v.date ? format(v.date, "EEEE, d MMMM yyyy") : "Pick a date"}
      </p>
      {hasTime ? (
        <p className={cn("mt-0.5 text-[15px] font-semibold", MONO)}>
          {`${formatTime(v.startTime!)} – ${formatTime(v.endTime!)}`}
        </p>
      ) : (
        <p className="mt-0.5 text-[15px] text-[#5b606b]">No time picked yet</p>
      )}
      {hasTime && (
        <p className="mt-0.5 text-[13px] text-[#5b606b]">{hours === 1 ? "1 hour" : `${hours} hours`}</p>
      )}

      {equipment.some((e) => (e?.equipmentId ?? "").trim()) && (
        <>
          <p className="mt-4 text-[13px] text-[#5b606b]">Equipment</p>
          <ul className="mt-1.5 list-none space-y-1.5">
            {equipment
              .filter((e) => (e?.equipmentId ?? "").trim())
              .map((e, i) => (
                <li key={`${e?.equipmentId}-${i}`} className="flex justify-between gap-3 text-[14px]">
                  <span className="min-w-0 truncate">{e?.equipmentId}</span>
                  <span className={cn("shrink-0 text-[13px] text-[#5b606b]", MONO)}>
                    {Number(e?.quantity) > 0 ? e?.quantity : "—"}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}

      <ul className="mt-5 list-none space-y-2.5 border-t border-[#ececea] pt-5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2.5 text-[14px]">
            {c.done ? (
              <span className="tick-in grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neutral-900 text-white">
                <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
              </span>
            ) : (
              <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full border-[1.5px] border-[#c9cac6]" />
            )}
            <span className={c.done ? "text-neutral-900" : "text-[#5b606b]"}>
              {c.label}
              <span className="sr-only">{c.done ? ", done" : ", still needed"}</span>
            </span>
          </li>
        ))}
      </ul>

      <button
        type="submit"
        disabled={submitting}
        className="group mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-neutral-900 text-[15px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-70 [[data-portal]_&]:bg-(--accent-solid) [[data-portal]_&]:hover:bg-(--accent-solid-hover) [[data-portal]_&]:focus-visible:ring-(--accent-ring)"
      >
        {submitLabel}
        {submitting ? (
          <Spinner size="sm" label="Submitting" />
        ) : (
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-[3px]"
          />
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="mt-2 h-11 w-full rounded-[10px] text-[14px] text-[#5b606b] transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
      >
        Cancel
      </button>
      <p className="mt-3 text-[13px] leading-relaxed text-[#5b606b]">
        You get a reference number right away. The slot is held as Pending until GSO confirms it.
      </p>
    </aside>
  );
}
