import { useNavigate } from "react-router-dom";
import { Archive } from "lucide-react";

import { Button, ContainerCard } from "@/components";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { useRecordsRoom } from "@/features/records/shelf-hooks";
import { boxName, levelTitle, type DocType } from "@/features/records/shelf-types";

/**
 * Where this document is kept in the Records Room, beside the form and never
 * on it: the office's storage is not a field of the National Archives form,
 * so this is hidden when printing.
 *
 * Since 30 Oct 2026 an approved document is placed in a box by hand: until it
 * is, this says so and leads to the room to place it. A form not yet
 * approved is not filed, and this says that too.
 */
export function FiledLocation({ type, sourceId, status }: { type: DocType; sourceId: string; status: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { shelves, boxes, contents, loading } = useRecordsRoom();
  if (loading) return null;
  const entry = contents.find((c) => c.documentType === type && c.sourceId === sourceId);
  const box = entry ? boxes.find((b) => b.id === entry.boxId) : undefined;
  let where: { shelfId: string; shelfName: string; levelName: string } | null = null;
  for (const shelf of shelves) {
    const level = box ? shelf.levels.find((l) => l.id === box.shelfLevelId) : undefined;
    if (level) where = { shelfId: shelf.id, shelfName: shelf.name, levelName: levelTitle(level) };
  }
  const key = `${type}-${sourceId}`;
  const approved = status === "Approved";

  return (
    <ContainerCard className="print:hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        <Archive aria-hidden className="h-4 w-4 shrink-0 text-neutral-500" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-[#6b707a]">Records Room</div>
          {box && where ? (
            <div className="text-[13.5px] text-neutral-900">
              <span className="font-semibold">{where.shelfName}</span>
              <span className="text-[#5b606b]"> › {where.levelName} › </span>
              <span className="font-semibold">{boxName(box)}</span>
            </div>
          ) : approved ? (
            <div className="text-[13.5px] text-neutral-900">Unplaced — approved, and not in a box yet.</div>
          ) : status === "Cancelled" ? (
            <div className="text-[13.5px] text-[#5b606b]">Voided: not filed.</div>
          ) : (
            <div className="text-[13.5px] text-[#5b606b]">Not filed: it is placed in a box once it is approved.</div>
          )}
        </div>
        {box && where ? (
          <Button
            variant="outline"
            onClick={() => navigate(`/records?shelf=${encodeURIComponent(where!.shelfId)}&box=${encodeURIComponent(`${box.shelfLevelId}~${box.slot}`)}&doc=${encodeURIComponent(key)}`)}
          >
            Locate
          </Button>
        ) : approved && can(user, "manage:records") ? (
          <Button variant="outline" onClick={() => navigate(`/records?place=${encodeURIComponent(key)}`)}>
            Place in the Records Room
          </Button>
        ) : null}
      </div>
    </ContainerCard>
  );
}
