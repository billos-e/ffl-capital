import { redirect } from "next/navigation";
import { LeadListViewScope } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPartnerId } from "@/lib/partner/session";
import { PageHeader } from "@/components/ui/page-header";
import { PartnerLeadsListClient } from "@/components/partner/partner-leads-list-client";
import { TablePagination } from "@/components/ui/table-pagination";
import { parsePageParams } from "@/lib/pagination";
import { buildPartnerLeadsWhere } from "@/lib/partner/partner-leads-query";
import { adminDatePeriodLabel } from "@/lib/admin/admin-date-period";
import {
  PARTNER_LEAD_SORT_KEYS,
  buildPartnerLeadOrderBy,
  buildPartnerLeadSortHref,
  parsePartnerLeadSort,
} from "@/lib/partner/partner-leads-sort";
import {
  PARTNER_LEAD_COLUMNS,
  mergeColumnsWithCatalog,
  portalColumnsFromView,
} from "@/lib/leads/list-view-columns";
import {
  ensurePartnerDefaultView,
  getDefaultLeadView,
  getLeadViewById,
  listLeadViews,
} from "@/lib/leads/lead-list-view-service";
import {
  loadEnabledCategoryLabels,
  resolveLeadTypeDisplay,
} from "@/lib/lead-categories/category-labels";
import {
  leadViewSortSchema,
  parsePartnerFilters,
  type LeadViewColumn,
} from "@/lib/leads/list-view-schema";
import {
  leadViewDraftsEqual,
  parseLeadViewDraft,
} from "@/lib/leads/lead-view-draft";
import { isPartnerRefundAllowed } from "@/lib/refunds/eligibility";

const BASE_PATH = "/partner/leads";

export default async function PartnerLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    page?: string;
    pageSize?: string;
    sort?: string;
    dir?: string;
    draft?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const partnerId = await getPartnerId();
  if (!partnerId) redirect("/onboarding");

  await ensurePartnerDefaultView(partnerId);

  let viewId = resolvedSearchParams.view;
  if (!viewId) {
    const defaultView = await getDefaultLeadView(
      LeadListViewScope.partner,
      partnerId,
    );
    if (defaultView) redirect(`${BASE_PATH}?view=${defaultView.id}`);
  }

  const view = viewId ? await getLeadViewById(viewId) : null;
  if (
    !view ||
    view.scope !== LeadListViewScope.partner ||
    view.partnerId !== partnerId
  ) {
    const defaultView = await getDefaultLeadView(
      LeadListViewScope.partner,
      partnerId,
    );
    if (defaultView) redirect(`${BASE_PATH}?view=${defaultView.id}`);
    redirect(BASE_PATH);
  }

  const views = await listLeadViews(LeadListViewScope.partner, partnerId);
  const savedFilters = parsePartnerFilters(view.filters);
  const sortJson = leadViewSortSchema.parse(view.sort);
  const savedColumns = mergeColumnsWithCatalog(
    PARTNER_LEAD_COLUMNS,
    view.columns as LeadViewColumn[],
  );
  const draft = parseLeadViewDraft("partner", resolvedSearchParams.draft);
  const appliedDraft =
    draft &&
    !leadViewDraftsEqual("partner", draft, {
      name: view.name,
      filters: savedFilters,
      columns: savedColumns,
    })
      ? draft
      : null;
  const filters = appliedDraft
    ? parsePartnerFilters(appliedDraft.filters)
    : savedFilters;
  const columns = appliedDraft
    ? mergeColumnsWithCatalog(PARTNER_LEAD_COLUMNS, appliedDraft.columns)
    : savedColumns;
  const tableColumns = portalColumnsFromView(PARTNER_LEAD_COLUMNS, columns);

  const { page, pageSize, skip } = parsePageParams(resolvedSearchParams);
  const sortState = parsePartnerLeadSort(sortJson, resolvedSearchParams);
  const orderBy = buildPartnerLeadOrderBy(sortJson, resolvedSearchParams);
  const where = await buildPartnerLeadsWhere(partnerId, filters);

  const [total, deliveries, filterSets, distinctStatesRaw, categories] = await Promise.all([
    prisma.leadDelivery.count({ where }),
    prisma.leadDelivery.findMany({
      where,
      include: {
        lead: true,
        refundRequests: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy,
      skip,
      take: pageSize,
    }),
    prisma.partnerFilterSet.findMany({
      where: { partnerId, isTemplate: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    prisma.lead.findMany({
      where: { leadDeliveries: { some: { partnerId } } },
      select: { state: true },
      distinct: ["state"],
      orderBy: { state: "asc" },
    }),
    loadEnabledCategoryLabels(),
  ]);

  const availableStates = distinctStatesRaw.map((l) => l.state);
  const paginationParams: Record<string, string | undefined> = {
    view: view.id,
    sort: resolvedSearchParams.sort,
    dir: resolvedSearchParams.dir,
    draft: appliedDraft ? resolvedSearchParams.draft : undefined,
  };

  const sortHrefMap = Object.fromEntries(
    PARTNER_LEAD_SORT_KEYS.map((key) => [
      key,
      buildPartnerLeadSortHref(BASE_PATH, paginationParams, key, sortState),
    ]),
  );

  const filterChips = buildPartnerFilterChips(filters, filterSets);

  return (
    <div>
      <PageHeader
        title="My Leads"
        subtitle="All leads delivered to your account — request refunds individually or in bulk"
        badge={
          <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-sm font-semibold text-orange-700">
            {total}
          </span>
        }
      />

      <PartnerLeadsListClient
        basePath={BASE_PATH}
        views={views}
        activeView={view}
        appliedDraft={appliedDraft ? { name: appliedDraft.name, filters, columns } : null}
        catalog={PARTNER_LEAD_COLUMNS}
        partnerMeta={{ filterSets, availableStates }}
        filterSummary={
          filterChips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-1 text-xs text-slate-500">
              {filterChips.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-slate-100 px-2 py-0.5"
                >
                  {c}
                </span>
              ))}
            </div>
          ) : null
        }
        deliveries={deliveries.map((d) => {
          const refundReq = d.refundRequests[0];
          const isRefunded = !!d.refundedAt;
          const canRefund =
            isPartnerRefundAllowed(d.channel) &&
            d.lead.refundable &&
            !isRefunded &&
            !refundReq;
          return {
            id: d.id,
            price: Number(d.price),
            channel: d.channel,
            deliveredAt: d.deliveredAt.toISOString(),
            refundedAt: d.refundedAt?.toISOString() ?? null,
            canRefund,
            refundStatus: refundReq?.status ?? null,
            lead: {
              firstName: d.lead.firstName,
              lastName: d.lead.lastName,
              email: d.lead.email,
              phone: d.lead.phone,
              state: d.lead.state,
              address: d.lead.address,
              leadType: d.lead.leadType ?? "",
              leadTypeLabel: resolveLeadTypeDisplay({
                leadType: d.lead.leadType,
                categoryResolution: d.lead.categoryResolution,
                categoryCandidateTypes: d.lead.categoryCandidateTypes,
                categories,
              }).label,
              intent: d.lead.intent,
              haveIul: d.lead.haveIul,
              primaryGoal: d.lead.primaryGoal,
              refundable: d.lead.refundable,
              trustedformCertUrl: d.lead.trustedformCertUrl,
            },
          };
        })}
        columns={tableColumns}
        sort={{
          active: sortState.field,
          dir: sortState.direction,
          hrefBySortKey: sortHrefMap,
        }}
        pagination={
          total > 0 ? (
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              basePath={BASE_PATH}
              searchParams={paginationParams}
            />
          ) : undefined
        }
      />
    </div>
  );
}

function buildPartnerFilterChips(
  filters: ReturnType<typeof parsePartnerFilters>,
  filterSets: { id: string; name: string }[],
) {
  const chips: string[] = [];
  if (filters.filterSetId) {
    const fs = filterSets.find((f) => f.id === filters.filterSetId);
    chips.push(`Filter set: ${fs?.name ?? filters.filterSetId}`);
  }
  if (filters.locations?.length) chips.push(`Locations: ${filters.locations.join(", ")}`);
  if (filters.channels?.length) chips.push(`Channel: ${filters.channels.join(", ")}`);
  if (filters.types?.length) chips.push(`Type: ${filters.types.join(", ")}`);
  if (filters.statuses?.length) chips.push(`Status: ${filters.statuses.join(", ")}`);
  if (filters.datePeriod === "custom") {
    if (filters.from) chips.push(`Delivered from: ${filters.from}`);
    if (filters.to) chips.push(`Delivered to: ${filters.to}`);
  } else if (filters.datePeriod) {
    chips.push(
      `Delivered: ${adminDatePeriodLabel(filters.datePeriod) ?? filters.datePeriod}`,
    );
  }
  return chips;
}
