import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPartnerId } from "@/lib/partner/session";
import { PartnerLeadDetailView } from "@/components/partner/partner-lead-detail-view";
import type { LeadDetailTimelineItem } from "@/components/leads/lead-detail-types";
import type { LeadDetailPurchaseInfo } from "@/components/leads/lead-detail-panels";
import {
  loadAllCategoryLabels,
  resolveLeadTypeDisplay,
} from "@/lib/lead-categories/category-labels";
import { formatUsd } from "@/lib/format-money";
import { formatDateTimeLong } from "@/lib/format-datetime";
import { canPartnerMarkAgedLeadAsSold } from "@/lib/aged/partner-mark-sold";
import { isPartnerRefundAllowed } from "@/lib/refunds/eligibility";

export default async function PartnerLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const partnerId = await getPartnerId();
  if (!partnerId) redirect("/onboarding");

  const delivery = await prisma.leadDelivery.findUnique({
    where: { id },
    include: {
      lead: true,
      refundRequests: { orderBy: { createdAt: "desc" }, take: 1 },
      filterSet: { select: { name: true } },
    },
  });

  if (!delivery || delivery.partnerId !== partnerId) notFound();

  const lead = delivery.lead;
  const refundReq = delivery.refundRequests[0] ?? null;
  const isRefunded = !!delivery.refundedAt;
  const canRefund =
    isPartnerRefundAllowed(delivery.channel) &&
    lead.refundable &&
    !isRefunded &&
    !refundReq;
  const canMarkSold = canPartnerMarkAgedLeadAsSold({
    channel: delivery.channel,
    partnerSoldAt: delivery.partnerSoldAt,
    deliveredAt: delivery.deliveredAt,
    agedSaleCount: lead.agedSaleCount,
    isRefunded,
  });

  const categories = await loadAllCategoryLabels();
  const leadTypeLabel = resolveLeadTypeDisplay({
    leadType: lead.leadType,
    categoryResolution: lead.categoryResolution,
    categoryCandidateTypes: lead.categoryCandidateTypes,
    categories,
  }).label;
  const channelLabel = delivery.channel === "realtime" ? "Real-time" : "Aged";

  const timeline: LeadDetailTimelineItem[] = [
    {
      at: delivery.deliveredAt.toISOString(),
      label: `Delivered (${delivery.channel})`,
      detail: `${channelLabel} · ${formatUsd(delivery.price)}`,
    },
    ...(delivery.partnerSoldAt
      ? [
          {
            at: delivery.partnerSoldAt.toISOString(),
            label: "Marked sold",
            detail: "Removed from aged marketplace",
          },
        ]
      : []),
    ...(refundReq
      ? [
          {
            at: refundReq.createdAt.toISOString(),
            label: `Refund ${refundReq.status}`,
            detail: "Invalid phone",
          },
        ]
      : []),
    ...(delivery.refundedAt
      ? [
          {
            at: delivery.refundedAt.toISOString(),
            label: "Refunded",
            detail: "Delivery marked refunded",
          },
        ]
      : []),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const purchase: LeadDetailPurchaseInfo = {
    channelLabel,
    priceLabel: formatUsd(delivery.price),
    filterSetName: delivery.filterSet?.name ?? null,
    deliveredLabel: formatDateTimeLong(delivery.deliveredAt),
    refundedLabel: isRefunded
      ? formatDateTimeLong(delivery.refundedAt)
      : null,
    refundTypeLabel:
      refundReq && !isRefunded ? "Invalid Phone" : null,
    refundStatusLabel:
      refundReq && !isRefunded
        ? refundReq.status.charAt(0).toUpperCase() + refundReq.status.slice(1)
        : null,
    refundRequestedLabel:
      refundReq && !isRefunded
        ? formatDateTimeLong(refundReq.createdAt)
        : null,
  };

  return (
    <PartnerLeadDetailView
      lead={{
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        address: lead.address,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        dob: lead.dob,
        age: lead.age,
        leadType: lead.leadType,
        categoryResolution: lead.categoryResolution,
        leadTypeLabel,
        intent: lead.intent,
        haveIul: lead.haveIul,
        primaryGoal: lead.primaryGoal,
        stateYouCurrentlyLiveIn: lead.stateYouCurrentlyLiveIn,
        trustedformCertUrl: lead.trustedformCertUrl,
        tcpaConsent: lead.tcpaConsent,
        tcpaLanguage: lead.tcpaLanguage,
      }}
      rawPayload={lead.rawPayload}
      timeline={timeline}
      purchase={purchase}
      deliveredAt={delivery.deliveredAt.toISOString()}
      channel={delivery.channel}
      deliveryId={delivery.id}
      canRefund={canRefund}
      isRefunded={isRefunded}
      refundStatus={refundReq?.status ?? null}
      refundable={lead.refundable}
      trustedFormCertified={lead.trustedformValid ?? false}
      canMarkSold={canMarkSold}
      partnerSoldAt={delivery.partnerSoldAt?.toISOString() ?? null}
    />
  );
}
