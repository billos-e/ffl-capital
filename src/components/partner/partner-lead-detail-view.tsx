"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { LeadCategoryBadge } from "@/components/leads/lead-category-badge";
import { PartnerRefundButton } from "@/components/partner/partner-refund-button";
import { PartnerMarkSoldButton } from "@/components/partner/partner-mark-sold-button";
import { downloadPartnerLeadFiles } from "@/lib/leads/partner-lead-download-client";
import { isPartnerRefundAllowed } from "@/lib/refunds/eligibility";
import { formatDateTimeLong } from "@/lib/format-datetime";
import { DownloadSimple, ICON_WEIGHT_LINEAR } from "@/lib/icons/client";
import {
  LeadDetailCompliancePanel,
  LeadDetailContactPanel,
  LeadDetailIulPanel,
  LeadDetailOtherFieldsPanel,
  LeadDetailPurchasePanel,
  type LeadDetailPurchaseInfo,
} from "@/components/leads/lead-detail-panels";
import { LeadDetailTimelineCard } from "@/components/leads/lead-detail-timeline";
import type {
  LeadDetailPanelLead,
  LeadDetailTimelineItem,
} from "@/components/leads/lead-detail-types";
import {
  LeadDetailKpiTile,
  LeadDetailPageHeader,
  LeadDetailSectionCard,
  LeadDetailSummaryCard,
  LeadDetailTabBar,
  LeadDetailTwoColumnLayout,
} from "@/components/leads/lead-detail-ui";
import { PartnerDeliveryStatusBadge } from "@/components/leads/lead-status-badge";

const PARTNER_TABS = [
  { id: "contact", label: "Contact" },
  { id: "iul", label: "IUL" },
  { id: "compliance", label: "Compliance" },
  { id: "purchase", label: "Purchase" },
] as const;

type PartnerTabId = (typeof PARTNER_TABS)[number]["id"];

export type PartnerLeadDetailViewProps = {
  lead: LeadDetailPanelLead;
  rawPayload: unknown;
  timeline: LeadDetailTimelineItem[];
  purchase: LeadDetailPurchaseInfo;
  deliveredAt: string;
  channel: "realtime" | "aged";
  deliveryId: string;
  canRefund: boolean;
  isRefunded: boolean;
  refundStatus: string | null;
  refundable: boolean;
  trustedFormCertified: boolean;
  canMarkSold: boolean;
  partnerSoldAt: string | null;
};

export function PartnerLeadDetailView({
  lead,
  rawPayload,
  timeline,
  purchase,
  deliveredAt,
  channel,
  deliveryId,
  canRefund,
  isRefunded,
  refundStatus,
  refundable,
  trustedFormCertified,
  canMarkSold,
  partnerSoldAt,
}: PartnerLeadDetailViewProps) {
  const [tab, setTab] = useState<PartnerTabId>("contact");
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function downloadLead() {
    if (downloadPending) return;
    setDownloadPending(true);
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
    }
  }

  const deliveredLabel = formatDateTimeLong(deliveredAt);
  const subtitleParts = [
    lead.phone,
    lead.state,
    deliveredLabel ? `Delivered ${deliveredLabel}` : null,
  ].filter(Boolean);

  const channelBadgeLabel = channel === "realtime" ? "Real-time" : "Aged";
  const partnerRefundable = isPartnerRefundAllowed(channel) && refundable;
  const trustedFormLabel = lead.trustedformCertUrl
    ? trustedFormCertified
      ? "Certified"
      : "Present"
    : "Missing";

  return (
    <div className="space-y-2.5">
      <LeadDetailPageHeader
        backHref="/partner/leads"
        backLabel="Back to My Leads"
      />

      <LeadDetailSummaryCard
        title={
          <h2 className="text-lg font-bold text-slate-900">
            {lead.firstName} {lead.lastName}
          </h2>
        }
        badges={
          <>
            <LeadCategoryBadge
              leadType={lead.leadType ?? null}
              categoryResolution={lead.categoryResolution}
              leadTypeLabel={lead.leadTypeLabel}
            >
              {lead.leadTypeLabel}
            </LeadCategoryBadge>
            <Badge variant={channel === "realtime" ? "green" : "purple"}>
              {channelBadgeLabel}
            </Badge>
            <PartnerDeliveryStatusBadge
              isRefunded={isRefunded}
              refundStatus={refundStatus}
            />
            {partnerSoldAt ? (
              <Badge variant="green">Marked sold</Badge>
            ) : null}
          </>
        }
        subtitle={subtitleParts.join(" · ")}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void downloadLead()}
              disabled={downloadPending}
              aria-busy={downloadPending}
              className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
            >
              <DownloadSimple
                size={14}
                weight={ICON_WEIGHT_LINEAR}
                className="shrink-0"
              />
              {downloadPending ? "Preparing…" : "Download PDF"}
            </button>
            {canMarkSold ? (
              <PartnerMarkSoldButton deliveryId={deliveryId} />
            ) : null}
            {canRefund ? (
              <PartnerRefundButton leadDeliveryId={deliveryId} />
            ) : null}
            {downloadError ? (
              <p
                className="basis-full text-right text-xs text-red-600"
                role="alert"
              >
                {downloadError}
              </p>
            ) : null}
          </div>
        }
        kpis={
          <>
            <LeadDetailKpiTile label="Price" value={purchase.priceLabel} />
            <LeadDetailKpiTile label="Channel" value={channelBadgeLabel} />
            <LeadDetailKpiTile
              label="Refundable"
              value={partnerRefundable && !isRefunded ? "Yes" : "No"}
            />
            <LeadDetailKpiTile
              label="TrustedForm"
              value={trustedFormLabel}
              valueClassName={
                lead.trustedformCertUrl ? "text-orange-600" : undefined
              }
            />
          </>
        }
      />

      <LeadDetailTabBar
        tabs={PARTNER_TABS}
        activeId={tab}
        onSelect={setTab}
      />

      <LeadDetailTwoColumnLayout
        main={
          <>
            <LeadDetailSectionCard title={partnerTabTitle(tab)}>
              {tab === "contact" && <LeadDetailContactPanel lead={lead} />}
              {tab === "iul" && (
                <LeadDetailIulPanel lead={lead} showReceived={false} />
              )}
              {tab === "compliance" && <LeadDetailCompliancePanel lead={lead} />}
              {tab === "purchase" && <LeadDetailPurchasePanel purchase={purchase} />}
            </LeadDetailSectionCard>

            {rawPayload != null && (
              <LeadDetailSectionCard title="Other fields">
                <LeadDetailOtherFieldsPanel
                  rawPayload={rawPayload}
                  omitKeys={[
                    "receivedAt",
                    "received_at",
                    "received",
                    "lead_date",
                    "leadDate",
                    "lead_date_thom",
                  ]}
                />
              </LeadDetailSectionCard>
            )}
          </>
        }
        sidebar={
          <LeadDetailTimelineCard items={timeline} className="lg:self-start" />
        }
      />
    </div>
  );
}

function partnerTabTitle(tab: PartnerTabId): string {
  const found = PARTNER_TABS.find((t) => t.id === tab);
  return found?.label ?? "Details";
}
