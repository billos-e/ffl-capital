import assert from "node:assert/strict";
import { describe, test } from "node:test";
import JSZip from "jszip";
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFRawStream,
} from "pdf-lib";
import {
  buildPartnerLeadAnswerFields,
  buildPartnerLeadPdf,
  packagePartnerLeadPdfs,
  type PartnerLeadPdfData,
} from "@/lib/leads/partner-lead-download";

function pdfContainsText(document: PDFDocument, text: string): boolean {
  const encodedText = Buffer.from(text, "ascii").toString("hex").toUpperCase();
  return document.getPages().some((page) => {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray
        ? contents
            .asArray()
            .map((content) => document.context.lookup(content, PDFRawStream))
        : [document.context.lookup(contents, PDFRawStream)];

    return streams.some((stream) =>
      Buffer.from(decodePDFRawStream(stream).getBytes())
        .toString("latin1")
        .includes(encodedText),
    );
  });
}

describe("partner lead downloads", () => {
  test("includes readable answers and filters technical payload fields", () => {
    const answers = buildPartnerLeadAnswerFields({
      intent: "Family protection",
      haveIul: "No",
      primaryGoal: null,
      stateYouCurrentlyLiveIn: "Texas",
      beneficiary: "Spouse",
      beneficiaryType: null,
      historyOfCancer: null,
      mortgageLoanAmount: null,
      rawPayload: {
        Custom_Question: "A & B",
        coverage: { Preferred_Term: "20 years" },
        lead_id: "technical-lead-id",
        CRM_Record_ID: "technical-crm-id",
        Visitor_Token: "technical-token",
        Browser: "technical-browser",
        IP_Address: "192.0.2.1",
        User_Agent: "technical-agent",
        TCPA_Consent: "already covered below",
      },
    });

    assert.deepEqual(answers, [
      { label: "Intent", value: "Family protection" },
      { label: "Have IUL", value: "No" },
      { label: "State You Currently Live In", value: "Texas" },
      { label: "Beneficiary", value: "Spouse" },
      { label: "Custom Question", value: "A & B" },
      { label: "Coverage · Preferred Term", value: "20 years" },
    ]);
  });

  test("fits a multi-field lead and its delivery timestamp on one page in two columns", async () => {
    const data: PartnerLeadPdfData = {
      firstName: "Irene",
      lastName: "Ibarra",
      email: "aged-extra-1786477236475-29@aged-demo.example.com",
      phone: "+1 555 0100",
      address: "429 Birch Avenue",
      city: "Fairview",
      state: "MS",
      zip: "80029",
      dob: null,
      age: "59",
      leadTypeLabel: "Final Expense",
      answers: Array.from({ length: 14 }, (_, index) => ({
        label: `Custom answer ${index + 1}`,
        value: "Family protection details",
      })),
      tcpaConsent: null,
      tcpaLanguage: null,
      trustedformCertUrl: null,
      channel: "aged",
      deliveredAt: new Date("2026-09-18T20:26:00.000Z"),
      portalUrl: "https://portal.example.com/partner/leads/short-fixture",
    };

    const bytes = await buildPartnerLeadPdf(data);
    const document = await PDFDocument.load(bytes);

    assert.equal(
      document.getPageCount(),
      1,
      "a typical lead should fit on one page without isolating delivery details",
    );
    assert.equal(
      pdfContainsText(document, "CONSENT & COMPLIANCE"),
      false,
      "the empty consent and compliance section should be omitted",
    );
  });

  test("keeps a clickable portal action in the header on a multi-page PDF", async () => {
    const data: PartnerLeadPdfData = {
      firstName: "Élodie",
      lastName: "O'Neil",
      email: "elodie@example.com",
      phone: "+1 555 0100",
      address: "10 Main St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      dob: null,
      age: "42",
      leadTypeLabel: "Final Expense",
      answers: Array.from({ length: 60 }, (_, index) => ({
        label: `Custom answer ${index + 1}`,
        value: "Family protection details",
      })),
      tcpaConsent: "I agree to be contacted.",
      tcpaLanguage: "English",
      trustedformCertUrl: "https://cert.trustedform.com/example",
      channel: "realtime",
      deliveredAt: new Date("2026-09-30T12:00:00.000Z"),
      portalUrl: "https://portal.example.com/partner/leads/8e6bf8be-87e6-44cf-a0b5-225a3d6fa87a",
    };
    const bytes = await buildPartnerLeadPdf(data);
    const document = await PDFDocument.load(bytes);
    const pages = document.getPages();
    const annotationCount = document
      .getPages()
      .reduce((total, page) => total + (page.node.Annots()?.size() ?? 0), 0);

    assert.ok(bytes.byteLength > 500);
    assert.ok(document.getPageCount() > 1, "fixture should span multiple pages");
    assert.ok(
      (pages[0].node.Annots()?.size() ?? 0) >= 1,
      "the portal button should remain linked from the first-page header",
    );
    assert.equal(
      pdfContainsText(document, "CONSENT & COMPLIANCE"),
      true,
      "the consent and compliance section should remain when it has data",
    );
    assert.ok(annotationCount >= 2, "PDF should link TrustedForm and the portal button");
  });

  test("returns one PDF directly and packages multiple PDFs into a ZIP", async () => {
    const first = {
      filename: "lead-one.pdf",
      bytes: new Uint8Array([1, 2, 3]),
    };
    const second = {
      filename: "lead-two.pdf",
      bytes: new Uint8Array([4, 5, 6]),
    };

    const single = await packagePartnerLeadPdfs([first]);
    assert.equal(single.kind, "pdf");
    assert.equal(single.filename, first.filename);
    assert.deepEqual(single.bytes, first.bytes);

    const multiple = await packagePartnerLeadPdfs([first, second]);
    assert.equal(multiple.kind, "zip");
    const archive = await JSZip.loadAsync(multiple.bytes);
    assert.deepEqual(
      await archive.file(first.filename)!.async("uint8array"),
      first.bytes,
    );
    assert.deepEqual(
      await archive.file(second.filename)!.async("uint8array"),
      second.bytes,
    );
  });
});