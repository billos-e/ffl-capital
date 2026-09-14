import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  extractOtherPayloadFields,
  humanizePayloadKey,
} from "@/lib/leads/other-payload-fields";

describe("humanizePayloadKey", () => {
  test("turns underscores into title case words", () => {
    assert.equal(humanizePayloadKey("History_Of_Cancer"), "History Of Cancer");
    assert.equal(
      humanizePayloadKey("Monthly_Mortgage_Payment"),
      "Monthly Mortgage Payment",
    );
  });

  test("humanizes camelCase and dotted paths", () => {
    assert.equal(humanizePayloadKey("historyOfCancer"), "History Of Cancer");
    assert.equal(
      humanizePayloadKey("mortgage.loan.amount"),
      "Mortgage · Loan · Amount",
    );
  });
});

describe("extractOtherPayloadFields", () => {
  test("returns non-curated payload fields and skips empties", () => {
    const fields = extractOtherPayloadFields({
      First_Name: "Ada",
      Email: "ada@example.com",
      History_Of_Cancer: "No",
      Mortgage_Loan_Amount: "250000",
      Monthly_Mortgage_Payment: "",
      Notes: null,
      Extra_Flag: false,
    });

    assert.deepEqual(
      fields.map((f) => ({ label: f.label, value: f.value })),
      [
        { label: "History Of Cancer", value: "No" },
        { label: "Mortgage Loan Amount", value: "250000" },
        { label: "Extra Flag", value: "false" },
      ],
    );
  });

  test("flattens nested objects and joins arrays", () => {
    const fields = extractOtherPayloadFields({
      Intent: "Standard",
      mortgage: {
        loan: { amount: "100000" },
        tags: ["a", "b"],
      },
    });

    assert.deepEqual(
      fields.map((f) => ({ key: f.key, label: f.label, value: f.value })),
      [
        {
          key: "mortgage.loan.amount",
          label: "Mortgage · Loan · Amount",
          value: "100000",
        },
        {
          key: "mortgage.tags",
          label: "Mortgage · Tags",
          value: "a, b",
        },
      ],
    );
  });

  test("omits phone fields, including common aliases and nested values", () => {
    const fields = extractOtherPayloadFields({
      phone_number: "555-0100",
      telephoneNumber: "555-0101",
      mobilePhone: "555-0102",
      contact: {
        primary_phone: "555-0103",
        phone_type: "mobile",
      },
      Preferred_Contact_Method: "phone",
      Notes: "Keep this note",
    });

    assert.deepEqual(
      fields.map((field) => ({ label: field.label, value: field.value })),
      [
        { label: "Preferred Contact Method", value: "phone" },
        { label: "Notes", value: "Keep this note" },
      ],
    );
  });

  test("returns empty for non-object payloads", () => {
    assert.deepEqual(extractOtherPayloadFields(null), []);
    assert.deepEqual(extractOtherPayloadFields("x"), []);
    assert.deepEqual(extractOtherPayloadFields([]), []);
  });
});
