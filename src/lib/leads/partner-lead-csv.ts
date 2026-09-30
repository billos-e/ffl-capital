import { escapeCsv } from "@/lib/csv";

export type PartnerLeadCsvRow = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  dob: string | null;
  age: string | null;
  leadTypeLabel: string;
  answers: Array<{ label: string; value: string }>;
  tcpaConsent: string | null;
  tcpaLanguage: string | null;
  trustedformCertUrl: string | null;
  channel: string;
  price: string;
  refundedAt: Date | null;
  deliveredAt: Date;
};

const BASE_COLUMNS: Array<{
  key: string;
  label: string;
  value: (row: PartnerLeadCsvRow) => string | null;
}> = [
  { key: "firstName", label: "First Name", value: (row) => row.firstName },
  { key: "lastName", label: "Last Name", value: (row) => row.lastName },
  { key: "email", label: "Email", value: (row) => row.email },
  { key: "phone", label: "Phone", value: (row) => row.phone },
  { key: "address", label: "Address", value: (row) => row.address },
  { key: "city", label: "City", value: (row) => row.city },
  { key: "state", label: "State", value: (row) => row.state },
  { key: "zip", label: "ZIP", value: (row) => row.zip },
  { key: "dob", label: "Date of Birth", value: (row) => row.dob },
  { key: "age", label: "Age", value: (row) => row.age },
  { key: "leadType", label: "Lead Type", value: (row) => row.leadTypeLabel },
  { key: "intent", label: "Intent", value: (row) => answerValue(row, "Intent") },
  { key: "haveIul", label: "Have IUL", value: (row) => answerValue(row, "Have IUL") },
  {
    key: "primaryGoal",
    label: "Primary Goal",
    value: (row) => answerValue(row, "Primary Goal"),
  },
  {
    key: "stateYouCurrentlyLiveIn",
    label: "State You Currently Live In",
    value: (row) => answerValue(row, "State You Currently Live In"),
  },
  {
    key: "beneficiary",
    label: "Beneficiary",
    value: (row) => answerValue(row, "Beneficiary"),
  },
  {
    key: "beneficiaryType",
    label: "Beneficiary Type",
    value: (row) => answerValue(row, "Beneficiary Type"),
  },
  {
    key: "historyOfCancer",
    label: "History of Cancer",
    value: (row) => answerValue(row, "History of Cancer"),
  },
  {
    key: "mortgageLoanAmount",
    label: "Mortgage Loan Amount",
    value: (row) => answerValue(row, "Mortgage Loan Amount"),
  },
  {
    key: "tcpaConsent",
    label: "TCPA Consent",
    value: (row) => row.tcpaConsent,
  },
  {
    key: "tcpaLanguage",
    label: "TCPA Language",
    value: (row) => row.tcpaLanguage,
  },
  {
    key: "trustedformCertUrl",
    label: "TrustedForm Certificate URL",
    value: (row) => row.trustedformCertUrl,
  },
  {
    key: "channel",
    label: "Channel",
    value: (row) => (row.channel === "realtime" ? "Real-time" : "Aged"),
  },
  { key: "price", label: "Price", value: (row) => row.price },
  {
    key: "refundedAt",
    label: "Refunded At",
    value: (row) => row.refundedAt?.toISOString() ?? null,
  },
  {
    key: "deliveredAt",
    label: "Delivered At",
    value: (row) => row.deliveredAt.toISOString(),
  },
];

function answerValue(row: PartnerLeadCsvRow, label: string): string | null {
  return row.answers.find(
    (answer) => answer.label.toLowerCase() === label.toLowerCase(),
  )?.value ?? null;
}

function safeSpreadsheetCell(value: string | null | undefined): string {
  const text = value ?? "";
  // Prevent untrusted lead answers from being interpreted as spreadsheet formulas.
  const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return escapeCsv(safeText);
}

export function buildPartnerLeadsCsv(rows: PartnerLeadCsvRow[]): string {
  const baseLabels = new Set(BASE_COLUMNS.map(({ label }) => label.toLowerCase()));
  const extraLabels: string[] = [];
  const seenExtraLabels = new Set<string>();

  for (const row of rows) {
    for (const answer of row.answers) {
      const normalizedLabel = answer.label.trim().toLowerCase();
      if (
        !normalizedLabel ||
        baseLabels.has(normalizedLabel) ||
        seenExtraLabels.has(normalizedLabel)
      ) {
        continue;
      }
      seenExtraLabels.add(normalizedLabel);
      extraLabels.push(answer.label.trim());
    }
  }

  const header = [
    ...BASE_COLUMNS.map(({ label }) => label),
    ...extraLabels,
  ];
  const lines = rows.map((row) => {
    const answerMap = new Map(
      row.answers.map((answer) => [answer.label.trim().toLowerCase(), answer.value]),
    );
    const baseValues = BASE_COLUMNS.map(({ value }) => value(row));
    const extraValues = extraLabels.map(
      (label) => answerMap.get(label.toLowerCase()) ?? null,
    );
    return [...baseValues, ...extraValues].map(safeSpreadsheetCell).join(",");
  });

  return `\uFEFF${[header.map(safeSpreadsheetCell).join(","), ...lines].join("\r\n")}\r\n`;
}