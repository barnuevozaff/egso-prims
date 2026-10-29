import { CalendarDays, ClipboardList, FileText, SearchCheck } from "lucide-react";

import { portalPath } from "@/features/portal/paths";

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
    description: "For supplies, equipment or services that your office needs to procure.",
    cta: "Start Purchase Request",
    navLabel: "Purchase Request",
    kind: "filing",
    code: "PR",
    to: portalPath("/request"),
  },
  {
    icon: ClipboardList,
    // The code sits on the card's corner, so the title does not repeat it.
    title: "Requisition & Issue Slip",
    description: "For items to be issued to your office from the GSO supply stock.",
    cta: "Start Requisition",
    navLabel: "Requisition",
    kind: "filing",
    code: "RIS",
    to: portalPath("/ris"),
  },
  {
    icon: CalendarDays,
    title: "Facility Reservation",
    description: "For the use of a municipal hall, room or venue on a set date and time.",
    cta: "Start Reservation",
    navLabel: "Reservation",
    kind: "filing",
    code: "FR",
    to: portalPath("/reserve"),
  },
  {
    icon: SearchCheck,
    title: "Track Request",
    description: "Enter the reference number from your receipt.",
    cta: "Track Request",
    navLabel: "Track",
    kind: "lookup",
    to: portalPath("/track"),
  },
];
