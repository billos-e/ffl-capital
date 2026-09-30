"use client";

import { useState } from "react";
import { FileText } from "@/lib/icons/client";
import { EmptyState } from "@/components/ui/empty-state";
import type { PortalDataTableColumn } from "@/components/ui/portal-data-table";
import { LeadColumnSettingsBridge } from "@/components/leads/lead-column-settings-bridge";
import { LeadListTableShell } from "@/components/leads/lead-list-table-shell";
import { LeadViewsToolbar } from "@/components/leads/lead-views-toolbar";
import { PartnerLeadsTable } from "@/components/partner/partner-leads-table";
import { PartnersTableLayoutToggle } from "@/components/admin/partners-table-layout-toggle";
import { LeadToolbarColumnSettingsButton } from "@/components/leads/lead-table-column-picker-button";
import { usePortalDataTableLayout } from "@/hooks/use-portal-data-table-layout";
import { PARTNER_LEADS_TABLE_LAYOUT_KEY } from "@/lib/partner/partner-leads-table-display";
import { downloadPartnerLeadFiles } from "@/lib/leads/partner-lead-download-client";
import type { LeadColumnDef } from "@/lib/leads/list-view-columns";
import type { LeadViewEditorState } from "@/components/leads/lead-view-editor-sheet";
import { MAX_PARTNER_LEAD_DOWNLOADS } from "@/lib/leads/partner-lead-download-constants";

type ViewRecord = {
  id: string;
  name: string;
  filters: unknown;
  sort: unknown;
  columns: unknown;
  isDefault: boolean;
};

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

export function PartnerLeadsListClient({
  basePath,
  views,
  activeView,
  appliedDraft,
  catalog,
  partnerMeta,
  filterSummary,
  deliveries,
  columns,
  sort,
  pagination,
}: {
  basePath: string;
  views: ViewRecord[];
  activeView: ViewRecord;
  appliedDraft?: LeadViewEditorState | null;
  catalog: LeadColumnDef[];
  partnerMeta: {
    filterSets: { id: string; name: string }[];
    availableStates: string[];
  };
  filterSummary?: React.ReactNode;
  deliveries: DeliveryRow[];
  columns: PortalDataTableColumn[];
  sort: {
    active?: string;
    dir: "asc" | "desc";
    hrefBySortKey: Record<string, string>;
  };
  pagination?: React.ReactNode;
}) {
  const { layout, setLayout } = usePortalDataTableLayout(PARTNER_LEADS_TABLE_LAYOUT_KEY);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadPendingId, setDownloadPendingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function downloadSelected() {
    if (!selected.size || downloadPending) return;
    const deliveryIds = [...selected];
    setDownloadPending(true);
    setDownloadError(null);
    try {
      await downloadPartnerLeadFiles(
        deliveryIds,
        "Could not download selected leads.",
      );
      setSelected(new Set());
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Could not download selected leads.",
      );
    } finally {
      setDownloadPending(false);
    }
  }

  async function downloadDelivery(deliveryId: string) {
    if (downloadPending) return;
    setDownloadPending(true);
    setDownloadPendingId(deliveryId);
    setDownloadError(null);
    try {
      await downloadPartnerLeadFiles(
        [deliveryId],
        "Could not download this lead.",
      );
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Could not download this lead.",
      );
    } finally {
      setDownloadPending(false);
      setDownloadPendingId(null);
    }
  }

  const selectionAction = selected.size > 0 ? (
    <div
      className="flex items-center gap-1 sm:gap-1.5"
      aria-busy={downloadPending}
    >
      <button
        type="button"
        onClick={() => {
          setSelected(new Set());
          setDownloadError(null);
        }}
        disabled={downloadPending}
        className="rounded-lg px-1.5 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 sm:px-2 sm:text-xs"
      >
        Clear
      </button>
      <button
        type="button"
        onClick={() => void downloadSelected()}
        disabled={downloadPending}
        className="whitespace-nowrap rounded-lg bg-[#0B3D91] px-2 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#092f70] disabled:cursor-wait disabled:opacity-60 sm:px-3 sm:py-2 sm:text-xs"
      >
        {downloadPending
          ? "Preparing…"
          : selected.size === 1
            ? "Download PDF"
            : `Download ZIP (${selected.size})`}
      </button>
    </div>
  ) : null;

  const viewControls = (
    <>
      {selectionAction}
      <PartnersTableLayoutToggle layout={layout} onLayoutChange={setLayout} />
      <LeadToolbarColumnSettingsButton />
    </>
  );

  return (
    <LeadColumnSettingsBridge>
      <LeadListTableShell
        layout={layout}
        pagination={pagination}
        isEmpty={deliveries.length === 0}
        emptyState={
          <EmptyState
            icon={FileText}
            title="No leads match this view"
            description="Try editing this view’s filters or create a new view."
            accent="orange"
          />
        }
        toolbar={
          <LeadViewsToolbar
            scope="partner"
            apiBase="/api/partner/lead-views"
            basePath={basePath}
            views={views}
            activeView={activeView}
            appliedDraft={appliedDraft}
            catalog={catalog}
            partnerMeta={partnerMeta}
            filterSummary={filterSummary}
            displayControls={viewControls}
          />
        }
      >
        <PartnerLeadsTable
          deliveries={deliveries}
          columns={columns}
          sort={sort}
          layout={layout}
          selected={selected}
          setSelected={setSelected}
          downloadPending={downloadPending}
          downloadPendingId={downloadPendingId}
          onDownloadLead={(deliveryId) => void downloadDelivery(deliveryId)}
          downloadError={downloadError}
          setDownloadError={setDownloadError}
          tableFooter={layout === "table" ? pagination : undefined}
        />
      </LeadListTableShell>
    </LeadColumnSettingsBridge>
  );
}
