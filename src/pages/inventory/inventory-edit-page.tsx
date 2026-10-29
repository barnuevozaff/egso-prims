import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  ContainerCard,
  ErrorState,
  PageHeader,
  PageTransition,
  SkeletonText,
  toast,
} from "@/components";
import { updateInventoryItem, type ItemDraftInput } from "@/features/inventory/api";
import { useInventoryItem, useInventoryItems } from "@/features/inventory/hooks";
import { InvItemForm } from "@/features/inventory/components/inv-form/inv-item-form";

export function InventoryEditPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: item, loading } = useInventoryItem(id);
  const [submitting, setSubmitting] = React.useState(false);
  const { data: existing } = useInventoryItems(React.useMemo(() => ({}), []));

  const submit = async (input: ItemDraftInput) => {
    setSubmitting(true);
    try {
      const updated = await updateInventoryItem(id, input);
      toast.success(`${updated.itemCode} updated`);
      navigate("/inventory");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the item");
    }
    setSubmitting(false);
  };

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title={item ? `Edit ${item.itemCode}` : "Edit Inventory Item"}
        description="Update the item's name, category, unit and price. Its code and stock on hand do not change here; use Add Stocks for received items."
      />
      {loading ? (
        <ContainerCard padded className="mx-auto w-full max-w-3xl">
          <SkeletonText lines={8} />
        </ContainerCard>
      ) : !item ? (
        <ContainerCard className="mx-auto w-full max-w-3xl">
          <ErrorState
            title="Inventory item not found"
            description="It may have been deleted, or the link is out of date."
            action={{ label: "Back to list", onClick: () => navigate("/inventory") }}
          />
        </ContainerCard>
      ) : (
        <InvItemForm
          initial={item}
          existing={existing}
          submitting={submitting}
          onSubmit={submit}
          onCancel={() => navigate("/inventory")}
        />
      )}
    </PageTransition>
  );
}
