/**
 * Shared lead preview model for side sheets (partner aged, admin aged, refunds).
 */

export type LeadPreviewAnswer = {
  label: string;
  value: string;
};

export type LeadPreviewModel = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  /** Omitted from pre-purchase aged marketplace payloads. */
  phone?: string | null;
  address: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  age: string | null;
  leadType: string;
  leadTypeLabel: string;
  receivedAt?: string;
  /** Precomputed age for partner marketplace (avoids exposing receivedAt). */
  ageDays?: number;
  intent?: string;
  haveIul: string | null;
  primaryGoal: string | null;
  beneficiary: string | null;
  beneficiaryType: string | null;
  historyOfCancer: string | null;
  mortgageLoanAmount: string | null;
  /** Extra intake Q&A not already covered by named columns above. */
  otherAnswers: LeadPreviewAnswer[];
  /** Marketplace / delivery price when shown in the header chips. */
  price?: number | null;
  /** Lead status key (e.g. unmatched) — optional header chip. */
  status?: string | null;
};

/** Payload aliases already shown via named Qualification columns in lead preview. */
export const LEAD_PREVIEW_COLUMN_PAYLOAD_KEYS = [
  "Beneficiary",
  "beneficiary",
  "Relationship_Of_Beneficiary",
  "beneficiary_type_thom",
  "Beneficiary_Type",
  "beneficiaryType",
  "Beneficiary Type",
  "History_Of_Cancer",
  "historyOfCancer",
  "Mortgage_Loan_Amount",
  "mortgageLoanAmount",
];
