import * as React from "react";
import { useBlocker } from "react-router-dom";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * Asks before a half-filled form is thrown away: on Cancel, on a link or tab
 * in the app (the router's blocker), and on closing or reloading the browser
 * tab (beforeunload, where the browser shows its own wording).
 *
 * `active` is "the form has changes and is not being submitted", so an
 * untouched form leaves at once, and so does the navigation that follows a
 * successful submit, which happens while `submitting` is still true.
 */
export function LeaveGuard({ active }: { active: boolean }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
  );

  React.useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome 109 still needs returnValue set to show the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  const open = blocker.state === "blocked";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && blocker.reset?.()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[400px] gap-0 rounded-[14px] border-[#e4e4e1] bg-white p-6"
      >
        <DialogTitle className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">
          Leave this form?
        </DialogTitle>
        <DialogDescription className="mt-2 text-[14px] leading-relaxed text-[#5b606b]">
          What you typed will be lost.
        </DialogDescription>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          {/* Stay comes first so it takes the focus and Enter keeps the work;
              row-reverse puts it on the right. */}
          <button
            type="button"
            onClick={() => blocker.reset?.()}
            className="h-11 rounded-[10px] bg-neutral-900 px-4 text-[14px] font-medium text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            Stay
          </button>
          <button
            type="button"
            onClick={() => blocker.proceed?.()}
            className="h-11 rounded-[10px] border border-[#d4d5d2] bg-white px-4 text-[14px] font-medium text-neutral-900 transition-colors hover:border-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            Leave
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
