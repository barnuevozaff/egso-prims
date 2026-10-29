import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Printer, ShoppingCart } from "lucide-react";

import {
  Button,
  ContainerCard,
  ErrorState,
  PageHeader,
  PageTransition,
  SkeletonText,
  StatusBadge,
  toast,
} from "@/components";
import { usePurchaseRequest } from "@/features/purchase-requests/hooks";
import { departmentByCode } from "@/features/purchase-requests/types";
import { PRDetailPanels } from "@/features/purchase-requests/components/pr-detail-panels";
import { PRPrintSheet } from "@/features/shared/procurement-sheets";

export function PRDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: pr, loading } = usePurchaseRequest(id);

  return (
    <PageTransition className="space-y-6">
      {loading ? (
        <ContainerCard padded className="mx-auto w-full max-w-3xl">
          <SkeletonText lines={10} />
        </ContainerCard>
      ) : !pr ? (
        <ContainerCard className="mx-auto w-full max-w-3xl">
          <ErrorState
            title="Purchase request not found"
            description="It may have been deleted, or the link is out of date."
            action={{ label: "Back to list", onClick: () => navigate("/purchase-requests") }}
          />
        </ContainerCard>
      ) : (
        <>
          {/* Paper gets the official form; the panels below are screen only. */}
          <PRPrintSheet pr={pr} />
          <div data-print-hide="" className="space-y-6">
          <PageHeader
            title={pr.prNumber}
            description={`${departmentByCode(pr.departmentCode).name} · ${pr.requester}`}
            actions={
              <>
                <StatusBadge status={pr.status} className="mr-1" />
                <Button variant="ghost" onClick={() => navigate("/purchase-requests")}>
                  <ArrowLeft />
                  Back
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    toast.info(`Preparing ${pr.prNumber} for printing`);
                    window.print();
                  }}
                >
                  <Printer />
                  Print
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/purchase-requests/${pr.id}/edit`)}
                >
                  <Pencil />
                  Edit
                </Button>
                {/* The order created with the approval (21 Oct 2026): opened, never created again. */}
                {pr.poNumber && (
                  <Button onClick={() => navigate(`/purchase-orders/${encodeURIComponent(pr.poNumber!)}`)}>
                    <ShoppingCart />
                    Go to PO
                  </Button>
                )}
              </>
            }
          />
          <ContainerCard padded className="mx-auto w-full max-w-3xl">
            <PRDetailPanels pr={pr} />
          </ContainerCard>
          </div>
        </>
      )}
    </PageTransition>
  );
}
