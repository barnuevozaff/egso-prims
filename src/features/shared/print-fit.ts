/**
 * Fitting a ruled form to its sheets (30 Oct 2026).
 *
 * A form whose lines and ending fit on one sheet keeps the template's ruled
 * lines. One that does not runs onto the next sheet under the repeated column
 * heads, and blank ruled lines fill that last sheet so the ending (total,
 * clauses, signatures) sits at its foot, as on a full paper form, rather than
 * alone at the top of a sheet with an empty half-page above it.
 */

/** The printable height of an A4 portrait sheet within PrintSheet's 14mm margins, in CSS px. */
export const A4_PRINTABLE_HEIGHT = ((297 - 2 * 14) * 96) / 25.4;

/** Leeway for rounding between the measured layout and the printed one. */
const LEEWAY = 6;

export interface MeasuredForm {
  /** From the top of the sheet to the first item line. */
  first: number;
  /** The column heads, repeated at the top of each later sheet. */
  head: number;
  /** Each item line's height, in order. */
  lines: number[];
  /** One blank ruled line. */
  blank: number;
  /** The ending, kept together: total row, clauses and signatures. */
  end: number;
}

/** How many blank ruled lines to print after the items. */
export function fitBlankLines(m: MeasuredForm, min: number, page = A4_PRINTABLE_HEIGHT - LEEWAY): number {
  // Nothing measured (not laid out yet): the template's lines.
  if (!(m.blank > 0) || m.head + m.end >= page) return min;

  // Lines as the printer places them: one that does not fit starts the next sheet, under the heads.
  let y = m.first;
  let sheet = 0;
  const place = (h: number) => {
    if (y + h > page) {
      sheet++;
      y = m.head + h;
    } else y += h;
  };
  m.lines.forEach(place);
  let n = 0;
  for (; n < min; n++) place(m.blank);

  // It all fits on one sheet: the template's lines, as before.
  if (sheet === 0 && y + m.end <= page) return n;

  if (y + m.end > page) {
    // The ending does not fit under the last line: rule this sheet to its foot and go on to the next.
    while (y + m.blank <= page) {
      y += m.blank;
      n++;
    }
    y = m.head;
  }
  // Rule the last sheet down to where the ending meets its foot.
  while (y + m.blank + m.end <= page) {
    y += m.blank;
    n++;
  }
  return n;
}
