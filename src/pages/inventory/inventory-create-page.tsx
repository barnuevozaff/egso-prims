import * as React from "react";
import { useNavigate } from "react-router-dom";

import { PageHeader, PageTransition, toast } from "@/components";
import { createInventoryItem, type ItemDraftInput } from "@/features/inventory/api";
import { InvItemForm } from "@/features/inventory/components/inv-form/inv-item-form";
import { useInventoryItems } from "@/features/inventory/hooks";

export function InventoryCreatePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = React.useState(false);
  const { data: existing } = useInventoryItems(React.useMemo(() => ({}), []));

  const submit = async (input: ItemDraftInput) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Resolves only once the server has saved it and it has been read back.
      const item = await createInventoryItem(input);
      toast.success(`${item.itemCode} · ${item.name} saved`);
      navigate("/inventory");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The item was not saved.");
      setSubmitting(false);
    }
  };

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="New Inventory Item"
        description="Register one item with its opening stock. The item code is issued when you save."
      />
      <InvItemForm
        existing={existing}
        submitting={submitting}
        onSubmit={submit}
        onCancel={() => navigate("/inventory")}
      />
    </PageTransition>
  );
}
