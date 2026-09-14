"use client";

import type { ReactNode } from "react";
import { clsx } from "clsx";
import { LeadCategoryBadge } from "@/components/leads/lead-category-badge";
import { Badge } from "@/components/ui/badge";
import { PrimaryLinkArrow } from "@/components/ui/primary-link-arrow";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { Clock } from "@/lib/icons/client";
import { formatUsd } from "@/lib/format-money";
import { formatStateForIntegrity } from "@/lib/constants/us-states";
import { partnerAgedLeadAgeDays } from "@/lib/admin/admin-aged-leads-filters";
import { getPartnerAgedLeadAgeChipClassNames } from "@/lib/partner/aged-lead-age-chip";
import {
  refundLeadStatusBadge,
  refundLeadStatusLabel,
} from "@/lib/admin/refund-lead-snapshot";
import type {
  LeadPreviewAnswer,
  LeadPreviewModel,
} from "@/lib/leads/lead-preview";

export type { LeadPreviewAnswer, LeadPreviewModel };

type Props = {
  lead: LeadPreviewModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sheet title. Default: "Lead preview". */
  title?: string;
  /** Age-chip coloring threshold (marketplace min days). Default: 30. */
  agedDaysMin?: number;
  /** Admin CTA → full lead page. */
  showViewFullLead?: boolean;
  /** Override href for View full lead (default `/admin/leads/{id}`). */
  fullLeadHref?: string;
};

function displayValue(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  return value;
}

function hasAnswer(value: string | null | undefined): value is string {
  return value != null && value.trim() !== "";
}

function PreviewSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h3>
      <dl className="divide-y divide-slate-100 border-t border-slate-100">{children}</dl>
    </section>
  );
}

function PreviewFieldRow({
  label,
  value,
  href,
  valueClassName,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
  valueClassName?: string;
}) {
  const text = displayValue(value);
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd
        className={clsx(
          "min-w-0 text-right text-sm font-semibold text-slate-900",
          valueClassName,
        )}
      >
        {href && text !== "—" ? (
          <a
            href={href}
            className="font-semibold text-slate-900 underline-offset-2 hover:underline"
          >
            {text}
          </a>
        ) : (
          text
        )}
      </dd>
    </div>
  );
}

function PreviewAnswerRow({ label, value }: LeadPreviewAnswer) {
  return <PreviewFieldRow label={label} value={value} />;
}

export function LeadPreviewSheet({
  lead,
  open,
  onOpenChange,
  title = "Lead preview",
  agedDaysMin = 30,
  showViewFullLead = false,
  fullLeadHref,
}: Props) {
  if (!lead) return null;

  const name = `${lead.firstName} ${lead.lastName}`.trim();
  const ageDays =
    lead.ageDays ??
    (lead.receivedAt != null ? partnerAgedLeadAgeDays(lead.receivedAt) : 0);
  const ageChip = getPartnerAgedLeadAgeChipClassNames(ageDays, agedDaysMin);
  const statusKey = lead.status?.trim() || null;
  const statusLabel = statusKey
    ? (refundLeadStatusLabel[statusKey] ?? statusKey.replace(/_/g, " "))
    : null;
  const statusVariant = statusKey
    ? (refundLeadStatusBadge[statusKey] ?? "slate")
    : "slate";
  const viewHref = fullLeadHref ?? `/admin/leads/${lead.id}`;

  const qualificationRows: LeadPreviewAnswer[] = [
    ...(hasAnswer(lead.age) ? [{ label: "Age", value: lead.age }] : []),
    ...(hasAnswer(lead.haveIul) ? [{ label: "Have IUL", value: lead.haveIul }] : []),
    ...(hasAnswer(lead.primaryGoal)
      ? [{ label: "Primary goal", value: lead.primaryGoal }]
      : []),
    ...(hasAnswer(lead.beneficiary)
      ? [{ label: "Beneficiary", value: lead.beneficiary }]
      : []),
    ...(hasAnswer(lead.beneficiaryType)
      ? [{ label: "Beneficiary type", value: lead.beneficiaryType }]
      : []),
    ...(hasAnswer(lead.historyOfCancer)
      ? [{ label: "History of cancer", value: lead.historyOfCancer }]
      : []),
    ...(hasAnswer(lead.mortgageLoanAmount)
      ? [{ label: "Mortgage loan amount", value: lead.mortgageLoanAmount }]
      : []),
    ...(lead.otherAnswers ?? []).filter((row) => hasAnswer(row.value)),
  ];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={`Preview for ${name}`}
    >
      <SheetBody className="space-y-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold tracking-tight text-slate-900">{name}</p>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-600">
              {lead.state}
            </span>
          </div>
          {lead.email ? (
            <a
              href={`mailto:${lead.email}`}
              className="mt-0.5 block text-sm text-slate-500 underline-offset-2 hover:underline"
            >
              {lead.email}
            </a>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <LeadCategoryBadge leadType={lead.leadType || null}>
              {lead.leadTypeLabel}
            </LeadCategoryBadge>
            <span className={ageChip.chip}>
              <Clock size={12} className={ageChip.icon} aria-hidden />
              {ageDays} days old
            </span>
            {lead.price != null ? (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums bg-slate-100 text-slate-700">
                {formatUsd(lead.price)}
              </span>
            ) : null}
            {statusLabel ? (
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            ) : null}
          </div>
        </div>

        <PreviewSection title="Contact">
          {lead.phone ? (
            <PreviewFieldRow
              label="Phone"
              value={lead.phone}
              href={`tel:${lead.phone}`}
            />
          ) : null}
          <PreviewFieldRow label="Address" value={lead.address} />
          <PreviewFieldRow label="City" value={lead.city} />
          <PreviewFieldRow
            label="State"
            value={formatStateForIntegrity(lead.state)}
          />
          <PreviewFieldRow label="Zip" value={lead.zip} />
        </PreviewSection>

        {qualificationRows.length > 0 ? (
          <PreviewSection title="Qualification">
            {qualificationRows.map((row) => (
              <PreviewAnswerRow key={`${row.label}:${row.value}`} {...row} />
            ))}
          </PreviewSection>
        ) : null}

        {showViewFullLead ? (
          <PrimaryLinkArrow href={viewHref} onClick={() => onOpenChange(false)}>
            View full lead
          </PrimaryLinkArrow>
        ) : null}
      </SheetBody>
    </Sheet>
  );
}
