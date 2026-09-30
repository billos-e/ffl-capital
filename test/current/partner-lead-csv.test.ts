import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { csvToRecords } from "@/lib/csv";
import {
  buildPartnerLeadsCsv,
  type PartnerLeadCsvRow,
} from "@/lib/leads/partner-lead-csv";

function makeLead(
  overrides: Partial<PartnerLeadCsvRow> = {},
): PartnerLeadCsvRow {
  return {
    firstName: "Taylor",
    lastName: "Reed",
    email: "taylor@example.com",
    phone: "+1 555 0100",
    address: "10 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    dob: null,
    age: "42",
    leadTypeLabel: "Final Expense",
    answers: [{ label: "Intent", value: "Family protection" }],
    tcpaConsent: "I agree to be contacted.",
    tcpaLanguage: "English",
    trustedformCertUrl: null,
    channel: "realtime",
    price: "25.00",
    refundedAt: null,
    deliveredAt: new Date("2026-09-30T12:00:00.000Z"),
    ...overrides,
  };
}

describe("partner lead CSV export", () => {
  test("exports one lead as one row with lead details and escaped values", () => {
    const csv = buildPartnerLeadsCsv([
      makeLead({
        lastName: 'O"Neil',
        answers: [
          { label: "Intent", value: "Family protection" },
          { label: "Coverage · Plan", value: "A, B\nC" },
        ],
      }),
    ]);

    assert.ok(csv.startsWith("\uFEFF"));
    const records = csvToRecords(csv.slice(1));
    assert.equal(records.length, 1);
    assert.equal(records[0]["First Name"], "Taylor");
    assert.equal(records[0]["Last Name"], 'O"Neil');
    assert.equal(records[0].Intent, "Family protection");
    assert.equal(records[0]["Coverage · Plan"], "A, B\nC");
    assert.equal(records[0].Channel, "Real-time");
    assert.equal(records[0]["Delivered At"], "2026-09-30T12:00:00.000Z");
  });

  test("exports multiple leads as rows with a shared union of answer columns", () => {
    const csv = buildPartnerLeadsCsv([
      makeLead({ answers: [{ label: "Intent", value: "Protect family" }] }),
      makeLead({
        firstName: "Jordan",
        answers: [
          { label: "Intent", value: "Save for retirement" },
          { label: "Preferred Term", value: "20 years" },
        ],
      }),
    ]);

    const records = csvToRecords(csv.slice(1));
    assert.equal(records.length, 2);
    assert.equal(records[0]["Preferred Term"], "");
    assert.equal(records[1]["Preferred Term"], "20 years");
    assert.equal(records[1]["First Name"], "Jordan");
  });

  test("neutralizes spreadsheet formulas in imported answer values", () => {
    const csv = buildPartnerLeadsCsv([
      makeLead({
        answers: [
          { label: "Intent", value: "Family protection" },
          { label: "Imported Value", value: "=HYPERLINK(\"https://example.com\")" },
        ],
      }),
    ]);
    const records = csvToRecords(csv.slice(1));
    assert.equal(
      records[0]["Imported Value"],
      "'=HYPERLINK(\"https://example.com\")",
    );
  });
});