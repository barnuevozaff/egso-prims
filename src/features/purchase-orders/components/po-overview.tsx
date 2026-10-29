import { DepartmentChip, DocumentNumber } from "@/components";
import { formatDate } from "@/features/purchase-orders/lib";
import { poSupplierName, poTotal, supplierById, type PurchaseOrder } from "@/features/purchase-orders/types";
import { departmentByCode } from "@/features/purchase-requests/types";
import { formatPHP } from "@/lib/format";

/** A label above its value; an empty value reads "Not set" in grey. */
function Fact({ label, value, wide }: { label: string; value?: React.ReactNode; wide?: boolean }) {
  const empty = value === undefined || value === null || value === "";
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-[12px] text-[#6b707a]">{label}</dt>
      <dd className={empty ? "mt-0.5 text-[13.5px] text-[#8a8f98]" : "mt-0.5 text-[13.5px] text-neutral-900"}>
        {empty ? "Not set" : value}
      </dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-[#e6e6e3] px-4 py-3.5">
      <h3 className="mb-2.5 text-[13px] font-semibold text-neutral-900">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3">{children}</dl>
    </section>
  );
}

/**
 * The order at a glance (redesigned 21 Oct 2026): its source request, the
 * supplier, the terms printed on the order, and the signatories it carries.
 */
export function POOverview({ po }: { po: PurchaseOrder }) {
  const dept = departmentByCode(po.departmentCode);
  // Address and contact only exist for orders raised from the old register.
  const registered = supplierById(po.supplierId);
  const signatory = po.signatories?.approvedBy;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[12px] bg-[#fafaf9] px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-[12px] text-[#6b707a]">Order total · {po.items.length} {po.items.length === 1 ? "item" : "items"}</div>
          <div className="text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-neutral-900">
            {formatPHP(poTotal(po), { decimals: 2 })}
          </div>
        </div>
        <div className="text-right text-[12.5px] text-[#5b606b]">
          {po.poDate ? `PO date ${formatDate(po.poDate)}` : "Dated when approved"}
        </div>
      </div>

      <Group title="Source purchase request">
        <Fact label="PR reference" value={<DocumentNumber value={po.prNumber} />} />
        <Fact label="Official PR No." value={po.prOfficialNumber} />
        <Fact label="Requesting office" value={<DepartmentChip code={dept.name} color={dept.color} className="text-neutral-800" />} />
        <Fact label="Requested by" value={po.requester} />
        <Fact label="Purpose" value={po.purpose} wide />
      </Group>

      <Group title="Supplier">
        <Fact label="Name" value={poSupplierName(po)} wide />
        <Fact label="Address" value={po.supplierAddress ?? registered?.address} wide />
        <Fact label="TIN" value={po.supplierTin} />
        <Fact label="Contact number" value={po.supplierContact ?? registered?.contact} />
      </Group>

      <Group title="Procurement and delivery">
        <Fact label="Mode of procurement" value={po.modeOfProcurement} wide />
        <Fact label="Place of delivery" value={po.deliveryAddress} wide />
        <Fact label="Date of delivery" value={po.expectedDelivery ? formatDate(po.expectedDelivery) : undefined} />
        <Fact label="Delivery term" value={po.deliveryTerm} />
        <Fact label="Payment term" value={po.paymentTerm} />
        {(po.bacResolutionNo || po.bacResolutionSeries) && (
          <Fact
            label="BAC resolution (negotiated purchase)"
            value={[po.bacResolutionNo && `No. ${po.bacResolutionNo}`, po.bacResolutionSeries && `Series of ${po.bacResolutionSeries}`]
              .filter(Boolean)
              .join(", ")}
          />
        )}
      </Group>

      <Group title="Signatories">
        {po.signatories ? (
          <>
            <Fact label={signatory?.designation ?? "Approving signatory"} value={signatory?.name} />
            <Fact label={po.signatories.bacSecretary?.designation ?? "BAC Secretary"} value={po.signatories.bacSecretary?.name} />
            <p className="col-span-2 text-[12px] text-[#5b606b]">
              Copied from Settings when the order was approved{po.approvedBy ? ` by ${po.approvedBy}` : ""}. Later changes in Settings do not alter it.
            </p>
          </>
        ) : po.municipalMayor || po.bacSecretary ? (
          // Typed on the order before 21 Oct 2026.
          <>
            <Fact label="Municipal Mayor" value={po.municipalMayor} />
            <Fact label="BAC Secretary" value={po.bacSecretary} />
          </>
        ) : (
          <p className="col-span-2 text-[12.5px] text-[#5b606b]">
            Taken from Settings → Purchase Order signatories when the order is approved.
          </p>
        )}
      </Group>

      {/* Handover to the supplier under the old workflow — kept for those orders. */}
      {(po.issuedAt || po.acknowledgedAt) && (
        <Group title="Issued to supplier (earlier workflow)">
          <Fact label="Issued" value={po.issuedAt ? `${formatDate(po.issuedAt)} · ${po.issuedBy ?? "—"}` : undefined} />
          <Fact
            label="Acknowledged"
            value={po.acknowledgedAt ? `${formatDate(po.acknowledgedAt)} · ${po.acknowledgedBy ?? "—"}` : undefined}
          />
        </Group>
      )}
    </div>
  );
}
