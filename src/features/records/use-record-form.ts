import * as React from "react";

import type { ScheduleStatus } from "@/features/records/types";

/**
 * What the three Records Management forms share since 30 Oct 2026: saving by
 * action instead of by a status field, and a new line that is ready to type in.
 *
 * An action sets the status it saves as, then submits the form through the
 * browser, so the required boxes are checked exactly as before. The form has
 * no submit button, so Enter in a box saves nothing: a stray key never sends
 * a half-filled form.
 */
export function useRecordForm(current: ScheduleStatus | null) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const stay: ScheduleStatus = current ?? "Draft";
  const next = React.useRef<ScheduleStatus>(stay);
  const [savingTo, setSavingTo] = React.useState<ScheduleStatus | null>(null);

  /** Saves as `to`. The browser stops it first if a required box is empty. */
  const act = (to: ScheduleStatus) => {
    next.current = to;
    formRef.current?.requestSubmit();
    // requestSubmit runs the submit handler before it returns, so a submit
    // the browser stopped never carries this action into the next one.
    next.current = stay;
  };

  /** The status to save with, read once by the submit handler. */
  const take = () => {
    const to = next.current;
    setSavingTo(to);
    return to;
  };

  /** Brings the line just added into view with its first box focused. */
  const focusLine = (index: number) => {
    requestAnimationFrame(() => {
      const field = formRef.current?.querySelector<HTMLElement>(
        `[data-line="${index}"] textarea, [data-line="${index}"] input`,
      );
      if (!field) return;
      field.focus({ preventScroll: true });
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  return { formRef, act, take, savingTo, focusLine };
}
