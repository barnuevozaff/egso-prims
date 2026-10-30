/**
 * A comment as documents store it. Comments are no longer shown or added on
 * screen (30 Oct 2026); the ones a document already holds stay stored.
 */
export interface ThreadComment {
  id: string;
  author: string;
  office: string;
  text: string;
  createdAt: string;
  attachments?: string[];
}
