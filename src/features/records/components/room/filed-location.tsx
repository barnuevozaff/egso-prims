import { useNavigate } from "react-router-dom";
import { Archive } from "lucide-react";

import { Button, ContainerCard } from "@/components";
import { useRecordsRoom } from "@/features/records/shelf-hooks";
import { boxName, locationOf, type DocType } from "@/features/records/shelf-types";

/**
 * Where this document is kept in the Records Room — or, until it is approved,
 * that it will be filed then. Beside the form, never on it: the office's
 * storage is not a field of the National Archives form, so this is hidden
 * when printing and the printed form stays the form.
 */
export function FiledLocation({ type, sourceId }: { type: DocType; sourceId: string }) {
  const navigate = useNavigate();
  const { shelves, boxes, contents, loading } = useRecordsRoom();

  if (loading) return null;

  const entry = contents.find((c) => c.documentType === type && c.sourceId === sourceId);
  const box = entry ? boxes.find((b) => b.id === entry.boxId) : undefined;
  const location = locationOf(box, shelves);

  return (
    <ContainerCard className="print:hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        <Archive aria-hidden className="h-4 w-4 shrink-0 text-neutral-500" />
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Records Room
          </div>
          {box && location ? (
            <div className="text-[13px] text-neutral-900">
              <span className="font-semibold">{location.text}</span>
              <span className="text-neutral-500"> · {boxName(box)}</span>
            </div>
          ) : (
            <div className="text-[13px] text-neutral-600">
              Not filed yet. It is filed in the Records Room automatically once it is Approved.
            </div>
          )}
        </div>
        {box && location ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate(
                `/records/shelves?shelf=${location.shelfId}&level=${location.levelId}&box=${box.id}`,
              )
            }
          >
            View Location
          </Button>
        ) : null}
      </div>
    </ContainerCard>
  );
}
