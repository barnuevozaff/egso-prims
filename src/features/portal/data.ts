import { CalendarDays, ClipboardList, FileText, SearchCheck } from "lucide-react";

/**
 * The staff portal's four services.
 *
 * The contact details and announcements that used to sit here were
 * placeholders that no page rendered; they were removed rather than left for
 * someone to mistake for real office information.
 */

export interface PortalService {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  cta: string;
  navLabel: string;
  /** Filing starts a document; lookup follows one already filed. */
  kind: "filing" | "lookup";
  /** The reference prefix the document is issued under, shown on its card. */
  code?: string;
  to: string;
}

export const PORTAL_SERVICES: PortalService[] = [
  {
    icon: FileText,
    title: "Purchase Request",
    description: "Request supplies, equipment, or services your office needs to buy.",
    cta: "Create PR",
    navLabel: "Purchase Request",
    kind: "filing",
    code: "PR",
    to: "/portal/request",
  },
  {
    icon: ClipboardList,
    // The code sits on the card's corner, so the title does not repeat it.
    title: "Requisition & Issue Slip",
    description: "Get items the GSO already has in stock, issued to your office.",
    cta: "Request items",
    navLabel: "Requisition",
    kind: "filing",
    code: "RIS",
    to: "/portal/ris",
  },
  {
    icon: CalendarDays,
    title: "Facility Reservation",
    description: "Book a municipal hall, room, or venue for a date and time.",
    cta: "Reserve a facility",
    navLabel: "Reservation",
    kind: "filing",
    code: "FR",
    to: "/portal/reserve",
  },
  {
    icon: SearchCheck,
    title: "Track Request",
    description: "Enter the reference number from your receipt.",
    cta: "Track Request",
    navLabel: "Track",
    kind: "lookup",
    to: "/portal/track",
  },
];
