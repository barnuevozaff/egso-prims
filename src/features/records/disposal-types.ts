/**
 * Request for Authority to Dispose of Records — NAP Form No. 3 (Revised 2012).
 *
 * The form that asks permission. RA 9470 s. 2007 forbids destroying any public
 * record without the prior written authority of the executive director of the
 * National Archives, and this is how that authority is requested.
 */

import type { RecordsDocStatus, ScheduleStatus } from "@/features/records/types";

export type { ScheduleStatus };

/** One line of the table — the four columns, in the order the form prints. */
export interface DisposalItem {
  id: string;
  requestId: string;
  itemNumber: number;
  /** Refers out to a GRDS or RDS entry, written as the office cites it. */
  grdsRdsItemNo?: string;
  titleAndDescription: string;
  periodCovered?: string;
  /** "Retention period and provision/s complied (If Any)" — prose on paper. */
  retentionAndProvisions?: string;
}

/** A line as the form collects it, before the database assigns identity. */
export type DisposalItemDraft = Omit<DisposalItem, "id" | "requestId">;

/** The agency block at the head and the disposal block at the foot. */
export interface DisposalRequest {
  id: string;
  requestNo: string;
  agencyName: string;
  agencyAddress: string;
  /** As yyyy-MM-dd. */
  requestDate: string;
  telephoneNumber?: string;
  emailAddress?: string;
  /** The footer: where the records are and how much of them there is. */
  locationOfRecords?: string;
  volumeCubicMeter?: string;
  preparedBy?: string;
  preparedByPosition?: string;
  /** The agency head who certifies the statement printed on the form. */
  certifiedBy?: string;
  /** Their position — the authority the certification rests on. */
  certifiedByPosition?: string;
  status: RecordsDocStatus;
  /** Set when the form was voided (approved policy, 2026-10-20). */
  voidReason?: string;
  voidedAt?: string;
  /** The Administrator who voided it (email). */
  voidedBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** A request with its lines — what the detail page and print form read. */
export interface DisposalRequestWithItems extends DisposalRequest {
  items: DisposalItem[];
}

/** What the create and edit forms submit. */
export interface DisposalInput {
  agencyName: string;
  agencyAddress: string;
  requestDate: string;
  telephoneNumber?: string;
  emailAddress?: string;
  locationOfRecords?: string;
  volumeCubicMeter?: string;
  preparedBy?: string;
  preparedByPosition?: string;
  certifiedBy?: string;
  certifiedByPosition?: string;
  status: ScheduleStatus;
  items: DisposalItemDraft[];
}

export interface DisposalListFilters {
  search?: string;
  status?: RecordsDocStatus | "All";
}

/** The agency block this office files under, used to prefill a new request. */
export const DEFAULT_AGENCY = {
  name: "Municipality of Alaminos — General Services Office",
  address: "Poblacion, Alaminos, Laguna, 4001",
} as const;

/**
 * The certification the agency head signs over. Printed, never typed: it is
 * the form's own wording and a legal undertaking, so it must not be editable.
 */
export const CERTIFICATION_TEXT =
  "This is to certify that the above-mentioned records are no longer needed and not involved nor connected in any administrative or judicial cases.";

/**
 * The caption printed under the certification's signature line, broken where
 * the paper breaks it — it sits on two lines under the officer's name.
 */
export const CERTIFIED_BY_CAPTION =
  "Name and Signature of Agency Head\nor Duly Authorized Representative";

/** The two notes the form carries in its own margins. */
export const FORM_MARKINGS = {
  reference: "NAP Form No. 3\nRevised 2012",
  copies: "Accomplish in 3 copies",
} as const;
