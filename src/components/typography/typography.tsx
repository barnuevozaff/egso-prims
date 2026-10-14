import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Typography scale from the Design Foundation. Sizes are fixed pixel values —
 * do not restyle per usage; pick the correct component instead.
 */

type TextProps<T extends React.ElementType> = {
  as?: T;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

function createText<D extends React.ElementType>(
  defaultTag: D,
  baseClass: string,
  displayName: string,
) {
  function Text<T extends React.ElementType = D>({
    as,
    className,
    children,
    ...props
  }: TextProps<T>) {
    const Tag = (as ?? defaultTag) as React.ElementType;
    return (
      <Tag className={cn(baseClass, className)} {...props}>
        {children}
      </Tag>
    );
  }
  Text.displayName = displayName;
  return Text;
}

/** 20px semibold — one per page (e.g. "Welcome back, Administrator"). */
export const PageTitle = createText(
  "h1",
  "text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] text-neutral-900",
  "PageTitle",
);

/** 14px semibold — card and section headings. */
export const SectionTitle = createText(
  "h2",
  "text-[14px] font-semibold text-neutral-900",
  "SectionTitle",
);

/** 13px muted — descriptive line under a page title. */
export const Subtitle = createText(
  "p",
  "text-[14px] text-[#5b606b]",
  "Subtitle",
);

/**
 * 10px uppercase micro-label — sidebar groups, table headers.
 *
 * neutral-500, not the neutral-400 this used to be: at 10px, uppercase and
 * wide-tracked, neutral-400 measured 2.59:1 against a white card and 2.48:1 on
 * the neutral-50 band, well under the 4.5:1 WCAG asks of body-size text. One
 * step down the same cold ramp reaches 4.73:1 and reads almost identically.
 */
export const OverlineLabel = createText(
  "div",
  "text-[10px] font-semibold uppercase tracking-wider text-neutral-500",
  "OverlineLabel",
);

/** 11.5px muted — meta text, timestamps, helper copy. */
export const Caption = createText(
  "span",
  "text-[11.5px] text-neutral-500",
  "Caption",
);

/** 13px default body copy. */
export const BodyText = createText(
  "p",
  "text-[13px] text-neutral-700",
  "BodyText",
);
