import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DeliveryChannel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPartnerId } from "@/lib/partner/session";
import { PartnerAgedView } from "@/components/partner/partner-aged";
import {
  getAgedDaysThreshold,
  getAgedPriceTiers,
  getDefaultAgedPrice,
} from "@/lib/settings/app-settings";
import {
  buildAdminAgedLeadsWhere,
  buildAdminAgedTypeFilterOptions,
  parseAdminAgedLeadFilters,
  parsePartnerAgedClientFilters,
  partnerAgedLeadAgeDays,
  PARTNER_AGED_CLIENT_LOAD_LIMIT,
} from "@/lib/admin/admin-aged-leads-filters";
import {
  buildAgedAgeFilterOptions,
  resolveAgedPriceForReceivedAt,
} from "@/lib/aged/price-tiers";
import { resolveLeadTypeDisplay } from "@/lib/lead-categories/category-labels";
import { loadPartnerAvailableCategoryLabels } from "@/lib/lead-categories/partner-availability";
import { extractOtherPayloadFields } from "@/lib/leads/other-payload-fields";
import { LEAD_PREVIEW_COLUMN_PAYLOAD_KEYS } from "@/lib/leads/lead-preview";

export default async function PartnerAgedPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    type?: string;
    age?: string;
    page?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const partnerId = await getPartnerId();
  if (!partnerId) redirect("/onboarding");

  const partnerCategories = await loadPartnerAvailableCategoryLabels();
  const partnerTypes = partnerCategories.map((category) => category.type);
  const agedWhere = await buildAdminAgedLeadsWhere({
    ...parseAdminAgedLeadFilters({}),
  });
  const marketplaceWhere =
    partnerTypes.length > 0
      ? { AND: [agedWhere, { leadType: { in: partnerTypes } }] }
      : { AND: [agedWhere, { id: { in: [] } }] };

  const [
    agedLeads,
    totalEligible,
    fallbackPrice,
    agedDays,
    tiers,
    categories,
    purchasedAgedDeliveries,
  ] = await Promise.all([
      prisma.lead.findMany({
        where: marketplaceWhere,
        orderBy: { receivedAt: "asc" },
        take: PARTNER_AGED_CLIENT_LOAD_LIMIT,
      }),
      prisma.lead.count({ where: marketplaceWhere }),
      getDefaultAgedPrice(),
      getAgedDaysThreshold(),
      getAgedPriceTiers(),
      loadPartnerAvailableCategoryLabels(),
      prisma.leadDelivery.findMany({
        where: {
          partnerId,
          channel: DeliveryChannel.aged,
        },
        select: { leadId: true },
      }),
    ]);

  const purchasedAgedLeadIds = new Set(
    purchasedAgedDeliveries.map((delivery) => delivery.leadId),
  );
  const knownTypes = categories.map((category) => category.type);
  const typeFilterOptions = buildAdminAgedTypeFilterOptions(categories);
  const ageFilterOptions = buildAgedAgeFilterOptions(tiers);
  const knownAgeBuckets = tiers.map((t) => String(t.minDays));
  const lowestTierPrice = Math.min(...tiers.map((t) => t.price), fallbackPrice);

  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading…</div>}>
      <PartnerAgedView
        agedDays={agedDays}
        fromPrice={lowestTierPrice}
        ageFilterOptions={ageFilterOptions}
        priceTiers={tiers}
        allAgedLeads={agedLeads.map((lead) => ({
          id: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          ...(purchasedAgedLeadIds.has(lead.id) ? { phone: lead.phone } : {}),
          address: lead.address,
          city: lead.city,
          state: lead.state,
          zip: lead.zip,
          age: lead.age,
          leadType: lead.leadType ?? "",
          leadTypeLabel: resolveLeadTypeDisplay({
            leadType: lead.leadType,
            categoryResolution: lead.categoryResolution,
            categoryCandidateTypes: lead.categoryCandidateTypes,
            categories,
          }).label,
          ageDays: partnerAgedLeadAgeDays(lead.receivedAt),
          intent: lead.intent ?? "",
          haveIul: lead.haveIul,
          primaryGoal: lead.primaryGoal,
          beneficiary: lead.beneficiary,
          beneficiaryType: lead.beneficiaryType,
          historyOfCancer: lead.historyOfCancer,
          mortgageLoanAmount: lead.mortgageLoanAmount,
          otherAnswers: extractOtherPayloadFields(lead.rawPayload, {
            omitKeys: [
              ...LEAD_PREVIEW_COLUMN_PAYLOAD_KEYS,
              "receivedAt",
              "received_at",
              "received",
              "lead_date",
              "leadDate",
              "lead_date_thom",
            ],
          }).map(({ label, value }) => ({ label, value })),
          price: resolveAgedPriceForReceivedAt(
            lead.receivedAt,
            tiers,
            fallbackPrice,
          ),
        }))}
        totalEligible={totalEligible}
        loadCapped={totalEligible > PARTNER_AGED_CLIENT_LOAD_LIMIT}
        initialFilters={parsePartnerAgedClientFilters(
          resolvedSearchParams,
          knownTypes,
          knownAgeBuckets,
        )}
        typeFilterOptions={typeFilterOptions}
      />
    </Suspense>
  );
}
