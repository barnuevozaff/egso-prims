import * as React from "react";
import { PackagePlus, Pencil, Printer } from "lucide-react";

import {
  Button,
  ConfirmationModal,
  Drawer,
  DrawerActions,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Field,
  Input,
  Skeleton,
  SkeletonText,
  StatusBadge,
  toast,
} from "@/components";
import { addInventoryStock } from "@/features/inventory/api";
import { useInventoryItem, useStockCard } from "@/features/inventory/hooks";
import { stockStateOf, type StockCardEntry } from "@/features/inventory/types";
import { StockCardSheet } from "@/features/inventory/components/stock-card-sheet";
import { getRequest } from "@/features/ris/api";
import { printDate } from "@/features/shared/procurement-print-form";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { cn } from "@/lib/utils";

/**
 * Inventory item details (24 Oct 2026): what the item is, how much is on
 * hand, and its stock history — receipts and RIS issues with the balance
 * after each. Actions: Add Stocks, Print Stock Card (the official Appendix
 * 53 form), Edit, Close. No location, supplier, levels, comments or
 * attachments; their stored values are kept, only not shown.
 */

const qty = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 2 });
const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One stock-card line in words: what moved, and which way. */
function movement(e: StockCardEntry, office?: string): { text: string; tone: "in" | "out" } {
  if (e.quantityOut > 0) {
    const label = e.type === "RIS Release" ? "Issued" : e.type === "Correction" || e.type === "Manual Adjustment" ? "Adjusted" : "Out";
    return { text: `${label} −${qty(e.quantityOut)}${office ? ` · ${office}` : ""}`, tone: "out" };
  }
  const label =
    e.type === "Beginning Balance" ? "Opening stock" : e.type === "Return" ? "Returned" : e.type === "Stock Receipt" ? "Received" : "Added";
  return { text: `${label} +${qty(e.quantityIn)}`, tone: "in" };
}

export function InvDrawer({
  itemId,
  open,
  onOpenChange,
  onChanged,
  onEdit,
}: {
  itemId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
  onEdit?: (itemId: string) => void;
}) {
  const { user } = useAuth();
  const { data: item, loading, refresh } = useInventoryItem(open ? itemId : null);
  const stockCard = useStockCard(open ? itemId : null);
  const history = React.useMemo(() => [...stockCard.data].sort((a, b) => a.date.localeCompare(b.date)), [stockCard.data]);
  const isAdmin = user?.role === "Administrator";

  // Issues saved before the office was recorded take it from their slip.
  const [offices, setOffices] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    const missing = [
      ...new Set(history.filter((e) => e.quantityOut > 0 && !e.office && e.documentNumber.startsWith("RIS-")).map((e) => e.documentNumber)),
    ];
    if (missing.length === 0) return;
    let live = true;
    void Promise.all(
      missing.map((n) =>
        getRequest(n)
          .then((r) => [n, r?.departmentCode ?? ""] as const)
          .catch(() => [n, ""] as const),
      ),
    ).then((pairs) => {
      if (live) setOffices(Object.fromEntries(pairs.filter(([, o]) => o)));
    });
    return () => {
      live = false;
    };
  }, [history]);

  // Add Stocks
  const [adding, setAdding] = React.useState(false);
  const [addQty, setAddQty] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const requestId = React.useRef("");
  const addAmount = Number(addQty);
  const addValid = addQty.trim() !== "" && Number.isFinite(addAmount) && addAmount > 0;

  const openAdd = () => {
    requestId.current = crypto.randomUUID(); // one per dialog: a retry adds nothing more
    setAddQty("");
    setAdding(true);
  };

  const saveAdd = async () => {
    if (!item || !addValid || saving) return;
    setSaving(true);
    try {
      const r = await addInventoryStock({
        requestId: requestId.current,
        itemId: item.id,
        quantity: addAmount,
      });
      await Promise.all([refresh(), stockCard.refresh()]);
      toast.success(`${item.name}: ${qty(r.onHand)} ${item.unit} on hand`);
      onChanged?.();
      setAdding(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The stock was not added.");
    }
    setSaving(false);
  };

  return (
    <>
      {/* The printed Stock Card lives outside the drawer: dialogs never print. */}
      {open && item && !stockCard.loading && <StockCardSheet item={item} entries={history} offices={offices} />}
      <Drawer open={open} onOpenChange={onOpenChange} size="md">
        {loading || !item ? (
          <div className="p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-3 w-56" />
            <SkeletonText lines={6} className="mt-6" />
          </div>
        ) : (
          <>
            <DrawerHeader title={item.name} description={`${item.itemCode} · ${item.category}`} onClose={() => onOpenChange(false)}>
              {item.onHand <= 0 && (
                <div className="mt-2">
                  <StatusBadge status={stockStateOf(item)} />
                </div>
              )}
            </DrawerHeader>
            <DrawerBody>
              <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[12px] border border-[#ececea] bg-[#ececea]">
                <div className="bg-white px-4 py-3">
                  <dt className="text-[12.5px] text-[#6b707a]">Stock on hand</dt>
                  <dd className="mt-0.5 text-[20px] font-semibold tabular-nums text-neutral-900">
                    {qty(item.onHand)} <span className="text-[14px] font-normal text-[#5b606b]">{item.unit}</span>
                  </dd>
                </div>
                <div className="bg-white px-4 py-3">
                  <dt className="text-[12.5px] text-[#6b707a]">Unit of measure</dt>
                  <dd className="mt-1 text-[14px] text-neutral-900">{item.unit}</dd>
                </div>
                <div className="bg-white px-4 py-3">
                  <dt className="text-[12.5px] text-[#6b707a]">Unit price</dt>
                  <dd className="mt-1 text-[14px] tabular-nums text-neutral-900">{peso(item.unitPrice)}</dd>
                </div>
              </dl>

              <section className="mt-5" aria-labelledby="stock-history-title">
                <h3 id="stock-history-title" className="text-[13.5px] font-semibold text-neutral-900">
                  Stock history
                </h3>
                {stockCard.loading ? (
                  <SkeletonText lines={4} className="mt-3" />
                ) : history.length === 0 ? (
                  <p className="mt-2 rounded-[10px] border border-dashed border-[#e6e6e3] px-4 py-5 text-center text-[13px] text-[#5b606b]">
                    No stock movements yet.
                  </p>
                ) : (
                  <table className="mt-2 w-full table-fixed border-collapse text-[13px]">
                    <colgroup>
                      {/* Room for "30/10/2026" itself: at 22% of a phone's drawer the date ran into the reference. */}
                      <col style={{ width: "92px" }} />
                      <col style={{ width: "26%" }} />
                      <col />
                      <col style={{ width: "16%" }} />
                    </colgroup>
                    <thead>
                      <tr className="text-left text-[12.5px] text-[#6b707a]">
                        <th className="py-2 pr-2 font-normal">Date</th>
                        <th className="py-2 pr-2 font-normal">Reference</th>
                        <th className="py-2 pr-2 font-normal">Movement</th>
                        <th className="py-2 text-right font-normal">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((e) => {
                        const m = movement(e, e.office ?? offices[e.documentNumber]);
                        return (
                          <tr key={e.id} className="border-t border-[#f0f0ee] align-top">
                            <td className="whitespace-nowrap py-2 pr-2 tabular-nums text-neutral-700">{printDate(e.date)}</td>
                            <td className="truncate py-2 pr-2 font-['Geist_Mono',ui-monospace,monospace] text-[12.5px] text-neutral-700">
                              {e.documentNumber || "—"}
                            </td>
                            <td className={cn("py-2 pr-2 tabular-nums", m.tone === "in" ? "text-[#166534]" : "text-[#9a3412]")}>{m.text}</td>
                            <td className="py-2 text-right tabular-nums text-neutral-900">{qty(e.balance)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            </DrawerBody>
            <DrawerFooter>
              <DrawerActions>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                {can(user, "manage:inventory") && (
                  <Button variant="secondary" onClick={() => onEdit?.(item.id)}>
                    <Pencil />
                    Edit
                  </Button>
                )}
                <Button variant="secondary" onClick={() => window.print()} disabled={stockCard.loading}>
                  <Printer />
                  Print Stock Card
                </Button>
                {isAdmin && (
                  <Button onClick={openAdd}>
                    <PackagePlus />
                    Add Stocks
                  </Button>
                )}
              </DrawerActions>
            </DrawerFooter>

            <ConfirmationModal
              open={adding}
              onOpenChange={(o) => {
                if (!saving) setAdding(o);
              }}
              tone="success"
              icon={PackagePlus}
              title={`Add stock to ${item.name}`}
              description={`${item.itemCode} · now ${qty(item.onHand)} ${item.unit} on hand. The receipt is written to the stock card.`}
              confirmLabel="Add Stocks"
              loading={saving}
              confirmDisabled={!addValid}
              onConfirm={saveAdd}
            >
              <Field
                label={`Quantity received (${item.unit})`}
                required
                className="mt-3"
                error={addQty.trim() !== "" && !addValid ? "Enter a quantity greater than 0" : undefined}
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  autoFocus
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                  className="tabular-nums"
                />
              </Field>
              {addValid && (
                <p className="mt-3 text-[13px] text-[#5b606b]">
                  Stock after:{" "}
                  <span className="tabular-nums text-neutral-900">
                    {qty(item.onHand)} → {qty(item.onHand + addAmount)} {item.unit}
                  </span>
                </p>
              )}
            </ConfirmationModal>
          </>
        )}
      </Drawer>
    </>
  );
}
