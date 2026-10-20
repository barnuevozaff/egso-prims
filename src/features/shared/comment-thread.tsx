import * as React from "react";
import { Paperclip, Send } from "lucide-react";
import { format } from "date-fns";

import { Avatar, Button, Caption, EmptyState, Textarea } from "@/components";
import { useAuth } from "@/features/auth/auth-context";
import { initialsOf } from "@/lib/initials";

export interface ThreadComment {
  id: string;
  author: string;
  office: string;
  text: string;
  createdAt: string;
  attachments?: string[];
}

/** Conversation-style comment thread with composer (shared across modules). */
export function CommentThread({
  comments,
  onSubmit,
}: {
  comments: ThreadComment[];
  /** Persists the comment; resolve when saved. */
  onSubmit: (text: string) => Promise<void>;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    await onSubmit(text);
    setDraft("");
    setSending(false);
  };

  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <EmptyState
          title="No comments yet"
          description="Questions and clarifications about this record will appear here."
        />
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <Avatar size="sm" name={c.author} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12.5px] font-semibold text-neutral-900">{c.author}</span>
                  <Caption className="text-[10.5px]">{c.office}</Caption>
                  <Caption className="ml-auto shrink-0 text-[10.5px]">
                    {format(new Date(c.createdAt), "d MMM yyyy · h:mm a")}
                  </Caption>
                </div>
                <div className="mt-1 rounded-lg rounded-tl-sm bg-neutral-50 px-3 py-2 text-[12.5px] leading-relaxed text-neutral-800">
                  {c.text}
                </div>
                {c.attachments && c.attachments.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.attachments.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 text-[10.5px] text-neutral-600"
                      >
                        <Paperclip className="h-2.5 w-2.5" />
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2.5 border-t border-neutral-100 pt-4">
        {/* Whoever is signed in writes the comment, so their initials sit by the box. */}
        <Avatar size="sm" initials={initialsOf(user?.name ?? "")} name={user?.name} />
        <div className="flex-1">
          <Textarea
            rows={2}
            placeholder="Write a comment…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={sending}
          />
          <div className="mt-2 flex justify-end">
            <Button onClick={submit} loading={sending} disabled={!draft.trim()}>
              <Send />
              Comment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
