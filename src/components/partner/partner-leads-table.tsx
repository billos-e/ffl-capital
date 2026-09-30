"use client";

import { useState, useCallback, type Dispatch, type SetStateAction } from "react";
import { PortalAnchoredMenuContent } from "@/components/ui/portal-anchored-menu-content";
import { usePortalAnchoredMenu } from "@/hooks/use-portal-anchored-menu";
import { useRouter } from "next/navigation";
import { useNavigateWithPending } from "@/hooks/use-navigate-with-pending";
import { Badge } from "@/components/ui/badge";
import { LeadCategoryBadge } from "@/components/leads/lead-category-badge";
import {
  DotsThreeVertical,
  Eye,
  Wallet,
  DownloadSimple,
  ICON_WEIGHT_LINEAR,
} from "@/lib/icons/client";
import { formatDateTime } from "@/lib/format-datetime";
import { formatUsd, moneyCellClass } from "@/lib/format-money";
import {
  PortalDataTable,
  portalTableCell,
  portalTableDataCellClassName,
  portalTableRowClassName,
  portalRowActionsCellClassName,
  portalRowKebabTriggerClassName,
  type PortalDataTableColumn,
  type PortalDataTableLayout,
} from "@/components/ui/portal-data-table";
import { RefundRequestModal } from "@/components/refunds/refund-request-modal";
import { MAX_PARTNER_LEAD_DOWNLOADS } from "@/lib/leads/partner-lead-download-constants";

type DeliveryRow = {
  id: string;
  price: number;
  channel: string;
  deliveredAt: string;
  refundedAt: string | null;
  canRefund: boolean;
  refundStatus: string | null;
  lead: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    state: string;
    address: string | null;
    leadType: string;
    leadTypeLabel: string;
    intent: string | null;
    haveIul: string | null;
    primaryGoal: string | null;
    refundable: boolean;
    trustedformCertUrl: string | null;
  };
};

function PartnerLeadRefundDialog({
  deliveryId,
  onClose,
}: {
  deliveryId: string;
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <RefundRequestModal
      open
      onClose={onClose}
      title="Report an invalid number"
      submitLabel="Submit"
      onSubmit={async ({ refundType, reason }) => {
        const res = await fetch("/api/refunds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadDeliveryId: deliveryId,
            refundType,
            reason: reason || undefined,
          }),
        });
        if (!res.ok) throw new Error("Request failed");
        onClose();
        router.refresh();
      }}
    />
  );
}

function RowMenu({
  delivery,
  onRefund,
  onDownload,
  downloadPending,
  isDownloading,
  layout,
}: {
  delivery: DeliveryRow;
  onRefund: () => void;
  onDownload: () => void;
  downloadPending: boolean;
  isDownloading: boolean;
  layout: PortalDataTableLayout;
}) {
  const { push } = useNavigateWithPending();
  const [open, setOpen] = useState(false);
  const closeMenu = useCallback(() => setOpen(false), []);
  const menuItemCount = 2 + (delivery.canRefund ? 1 : 0);
  const { buttonRef, menuRef, menuStyle } = usePortalAnchoredMenu({
    open,
    onClose: closeMenu,
    estimatedMenuWidth: 176,
    estimatedMenuHeight: menuItemCount * 40 + 12,
    repositionKey: menuItemCount,
  });

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={portalRowKebabTriggerClassName(layout, { revealed: open })}
        aria-label="Lead actions"
        aria-expanded={open}
      >
        <DotsThreeVertical size={18} weight={ICON_WEIGHT_LINEAR} />
      </button>

      <PortalAnchoredMenuContent
        open={open}
        menuRef={menuRef}
        menuStyle={menuStyle}
        className="fixed z-50 w-44 rounded-xl border border-slate-100 bg-white py-1.5 shadow-lg"
      >
        <button
          type="button"
          className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          onClick={() => {
            setOpen(false);
            push(`/partner/leads/${delivery.id}`);
          }}
        >
          <Eye size={14} className="text-slate-400" />
          View lead
        </button>

        <button
          type="button"
          disabled={downloadPending}
          className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          onClick={() => {
            setOpen(false);
            onDownload();
          }}
        >
          <DownloadSimple
            size={14}
            weight={ICON_WEIGHT_LINEAR}
            className="shrink-0 text-slate-400"
          />
          {isDownloading ? "Preparing…" : "Download PDF"}
        </button>

        {delivery.canRefund && (
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50 transition-colors"
            onClick={() => {
              setOpen(false);
              onRefund();
            }}
          >
            <Wallet
              size={14}
              weight={ICON_WEIGHT_LINEAR}
              className="shrink-0 text-amber-500"
            />
            Report invalid number
          </button>
        )}
      </PortalAnchoredMenuContent>
    </>
  );
}

export function PartnerLeadsTable({
  deliveries,
  columns,
  sort,
  layout = "cards",
  selected,
  setSelected,
  downloadPending,
  downloadPendingId,
  onDownloadLead,
  downloadError,
  setDownloadError,
  tableFooter,
}: {
  deliveries: DeliveryRow[];
  columns: PortalDataTableColumn[];
  sort?: {
    active?: string;
    dir: "asc" | "desc";
    hrefBySortKey: Record<string, string>;
  };
  layout?: PortalDataTableLayout;
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  downloadPending: boolean;
  downloadPendingId: string | null;
  onDownloadLead: (deliveryId: string) => void;
  downloadError: string | null;
  setDownloadError: Dispatch<SetStateAction<string | null>>;
  tableFooter?: React.ReactNode;
}) {
  const { push, router } = useNavigateWithPending();
  const [pending, setPending] = useState(false);
  const [bulkRefundOpen, setBulkRefundOpen] = useState(false);
  const [refundDialogId, setRefundDialogId] = useState<string | null>(null);

  const refundable = deliveries.filter((d) => d.canRefund);
  const refundableSelected = refundable.filter((d) => selected.has(d.id));
  const pageIds = deliveries.map((delivery) => delivery.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selectedOnPage = deliveries.filter((delivery) => selected.has(delivery.id));

  const toggleAll = useCallback(() => {
    setDownloadError(null);
    if (allPageSelected) {
      setSelected((previous) => {
        const next = new Set(previous);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
      return;
    }
    const idsToAdd = pageIds.filter((id) => !selected.has(id));
    if (selected.size + idsToAdd.length > MAX_PARTNER_LEAD_DOWNLOADS) {
      setDownloadError(
        `You can select up to ${MAX_PARTNER_LEAD_DOWNLOADS} leads per download.`,
      );
      return;
    }
    setSelected((previous) => new Set([...previous, ...idsToAdd]));
  }, [allPageSelected, pageIds, selected, setDownloadError, setSelected]);

  const bulkRefundLabel =
    refundableSelected.length > 0
      ? `Report invalid (${refundableSelected.length})`
      : "Report invalid";

  const headerColumns = columns.map((col) => {
    if (col.key === "select") {
      return {
        ...col,
        headerClassName: col.headerClassName ?? "w-10",
        headerContent: (
          <input
            type="checkbox"
            checked={allPageSelected}
            onChange={toggleAll}
            disabled={downloadPending}
            className="rounded border-slate-300"
            aria-label="Select all leads on this page for download"
          />
        ),
      };
    }
    if (col.key === "actions") {
      const hideActionsHeader = layout === "cards" && selected.size === 0;
      const baseHeaderClass = col.headerClassName ?? "w-12 text-right";
      return {
        ...col,
        headerClassName: hideActionsHeader
          ? `${baseHeaderClass} invisible`
          : baseHeaderClass,
        headerContent: hideActionsHeader ? null : (
          <div className="flex justify-end">
            {(layout === "table" || selectedOnPage.length > 0) && (
              <button
                type="button"
                disabled={!refundableSelected.length}
                onClick={(e) => {
                  e.stopPropagation();
                  setBulkRefundOpen(true);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-amber-600 disabled:pointer-events-none disabled:opacity-40"
                aria-label={bulkRefundLabel}
                title={bulkRefundLabel}
              >
                <Wallet
                  size={18}
                  weight={ICON_WEIGHT_LINEAR}
                  className="shrink-0"
                  aria-hidden
                />
              </button>
            )}
          </div>
        ),
      };
    }
    return col;
  });

  function toggle(id: string) {
    setDownloadError(null);
    if (!selected.has(id) && selected.size >= MAX_PARTNER_LEAD_DOWNLOADS) {
      setDownloadError(
        `You can select up to ${MAX_PARTNER_LEAD_DOWNLOADS} leads per download.`,
      );
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkRefund(reason: string) {
    if (!refundableSelected.length) return;
    setPending(true);
    try {
      const res = await fetch("/api/refunds/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: refundableSelected.map((d) => ({
            leadDeliveryId: d.id,
            refundType: "invalid_phone" as const,
            reason: reason || undefined,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      setSelected(new Set());
      setBulkRefundOpen(false);
      router.refresh();
    } catch {
      /* allow retry */
    } finally {
      setPending(false);
    }
  }

  function cellClass(
    options: { first?: boolean; last?: boolean; className?: string } = {},
  ) {
    return (
      portalTableDataCellClassName(layout, options) ??
      options.className ??
      portalTableCell
    );
  }

  function renderCell(
    key: string,
    d: DeliveryRow,
    index: number,
    total: number,
  ) {
    const first = index === 0;
    const last = index === total - 1;

    switch (key) {
      case "select":
        return (
          <td
            key={key}
            className={cellClass({ first, last })}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected.has(d.id)}
              onChange={() => toggle(d.id)}
              disabled={downloadPending}
              className="rounded border-slate-300"
              aria-label={`Select ${d.lead.firstName} ${d.lead.lastName} for download`}
            />
          </td>
        );
      case "name":
        return (
          <td key={key} className={cellClass({ first, last })}>
            <p className="font-medium text-slate-900">
              {d.lead.firstName} {d.lead.lastName}
            </p>
            <p className="text-xs text-slate-400">{d.lead.email}</p>
          </td>
        );
      case "contact":
        return (
          <td
            key={key}
            className={cellClass({ first, last, className: "text-slate-500" })}
          >
            {d.lead.phone}
          </td>
        );
      case "location":
        return (
          <td key={key} className={cellClass({ first, last })}>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-600">
              {d.lead.state}
            </span>
          </td>
        );
      case "type":
        return (
          <td key={key} className={cellClass({ first, last })}>
            <LeadCategoryBadge leadType={d.lead.leadType || null}>
              {d.lead.leadTypeLabel}
            </LeadCategoryBadge>
          </td>
        );
      case "channel":
        return (
          <td key={key} className={cellClass({ first, last })}>
            <Badge variant={d.channel === "realtime" ? "green" : "purple"}>
              {d.channel === "realtime" ? "Real-time" : "Aged"}
            </Badge>
          </td>
        );
      case "price":
        return (
          <td
            key={key}
            className={cellClass({
              first,
              last,
              className: moneyCellClass("font-semibold text-slate-700"),
            })}
          >
            {formatUsd(d.price)}
          </td>
        );
      case "status":
        return (
          <td key={key} className={cellClass({ first, last })}>
            {d.refundedAt ? (
              <Badge variant="slate">Refunded</Badge>
            ) : d.refundStatus ? (
              <Badge variant="yellow">Invalid # {d.refundStatus}</Badge>
            ) : (
              <Badge variant="green">Active</Badge>
            )}
          </td>
        );
      case "delivered":
        return (
          <td
            key={key}
            className={cellClass({
              first,
              last,
              className: "text-slate-400 text-xs",
            })}
            suppressHydrationWarning
          >
            {formatDateTime(d.deliveredAt)}
          </td>
        );
      case "actions":
        return (
          <td
            key={key}
            className={portalRowActionsCellClassName(
              layout,
              cellClass({ first, last }),
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <RowMenu
              delivery={d}
              layout={layout}
              onRefund={() => setRefundDialogId(d.id)}
              onDownload={() => onDownloadLead(d.id)}
              downloadPending={downloadPending}
              isDownloading={downloadPendingId === d.id}
            />
          </td>
        );
      default:
        return null;
    }
  }

  return (
    <>
      {downloadError && (
        <p className="mb-3 text-sm font-medium text-red-600" role="alert">
          {downloadError}
        </p>
      )}
      <PortalDataTable
        columns={headerColumns}
        sort={sort}
        layout={layout}
        footer={tableFooter}
      >
        {deliveries.map((d) => (
          <tr
            key={d.id}
            className={`cursor-pointer ${portalTableRowClassName(undefined, layout)}`}
            onClick={() => push(`/partner/leads/${d.id}`)}
          >
            {headerColumns.map((col, i) =>
              renderCell(col.key, d, i, headerColumns.length),
            )}
          </tr>
        ))}
      </PortalDataTable>

      {bulkRefundOpen && (
        <RefundRequestModal
          open
          onClose={() => setBulkRefundOpen(false)}
          title="Report invalid numbers"
          titleHighlight={
            <span className="text-amber-600">({refundableSelected.length})</span>
          }
          submitLabel={`Submit (${refundableSelected.length})`}
          submitIcon={
            <Wallet size={14} weight={ICON_WEIGHT_LINEAR} className="shrink-0" />
          }
          submitClassName="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3.5 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
          isSubmitting={pending}
          onSubmit={({ reason }) => {
            void bulkRefund(reason);
          }}
        />
      )}

      {refundDialogId && (
        <PartnerLeadRefundDialog
          deliveryId={refundDialogId}
          onClose={() => setRefundDialogId(null)}
        />
      )}
    </>
  );
}
