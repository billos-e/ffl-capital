import {
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import JSZip from "jszip";
import type { Lead } from "@prisma/client";
import { PARTNER_EMAIL_BRAND } from "@/lib/email/email-layout";
import { extractOtherPayloadFields } from "@/lib/leads/other-payload-fields";

export type PartnerLeadAnswerSource = Pick<
  Lead,
  | "intent"
  | "haveIul"
  | "primaryGoal"
  | "stateYouCurrentlyLiveIn"
  | "beneficiary"
  | "beneficiaryType"
  | "historyOfCancer"
  | "mortgageLoanAmount"
  | "rawPayload"
>;

export type PartnerLeadPdfData = {
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
  deliveredAt: Date;
  portalUrl: string;
};

export type PartnerLeadPdfFile = {
  filename: string;
  bytes: Uint8Array;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 48;
const PAGE_BOTTOM = 48;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const COLUMN_GAP = 20;
const COLUMN_WIDTH = (CONTENT_WIDTH - COLUMN_GAP) / 2;
const FIELD_LABEL_GAP = 14;
const FIELD_VALUE_LINE_HEIGHT = 12;
const FIELD_BOTTOM_GAP = 3;
const NAVY = rgb(0.055, 0.09, 0.16);
const INK = rgb(0.12, 0.16, 0.22);
const MUTED = rgb(0.38, 0.43, 0.5);
const RULE = rgb(0.88, 0.9, 0.93);
const WHITE = rgb(1, 1, 1);

const PAYLOAD_OMIT_KEYS = [
  "receivedAt",
  "received_at",
  "received",
  "lead_date",
  "leadDate",
  "lead_date_thom",
  "beneficiary",
  "beneficiary_type",
  "beneficiaryType",
  "history_of_cancer",
  "historyOfCancer",
  "mortgage_loan_amount",
  "mortgageLoanAmount",
];

function normalizedValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isTechnicalPayloadField(key: string): boolean {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const compact = words.join("");
  return (
    words.some((word) =>
      ["id", "uuid", "token", "ip", "browser", "tracking"].includes(word),
    ) ||
    compact.includes("useragent") ||
    compact.includes("ipaddress")
  );
}

export function buildPartnerLeadAnswerFields(
  lead: PartnerLeadAnswerSource,
): Array<{ label: string; value: string }> {
  const curated = [
    { label: "Intent", value: lead.intent },
    { label: "Have IUL", value: lead.haveIul },
    { label: "Primary Goal", value: lead.primaryGoal },
    { label: "State You Currently Live In", value: lead.stateYouCurrentlyLiveIn },
    { label: "Beneficiary", value: lead.beneficiary },
    { label: "Beneficiary Type", value: lead.beneficiaryType },
    { label: "History of Cancer", value: lead.historyOfCancer },
    { label: "Mortgage Loan Amount", value: lead.mortgageLoanAmount },
  ].flatMap(({ label, value }) => {
    const cleanValue = normalizedValue(value);
    return cleanValue ? [{ label, value: cleanValue }] : [];
  });

  const additional = extractOtherPayloadFields(lead.rawPayload, {
    omitKeys: PAYLOAD_OMIT_KEYS,
  })
    .filter((field) => !isTechnicalPayloadField(field.key))
    .map(({ label, value }) => ({ label, value }));

  return [...curated, ...additional];
}

function brandColor() {
  const hex = PARTNER_EMAIL_BRAND.replace("#", "");
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  return rgb(red, green, blue);
}

function safePdfText(value: string, font: PDFFont): string {
  const substitutions: Record<string, string> = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2013": "-",
    "\u2014": "-",
    "\u2026": "...",
    "\u00a0": " ",
  };

  return Array.from(value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ")).map(
    (character) => {
      const candidate = substitutions[character] ?? character;
      try {
        font.encodeText(candidate);
        return candidate;
      } catch {
        const decomposed = candidate.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
        try {
          font.encodeText(decomposed);
          return decomposed;
        } catch {
          return "?";
        }
      }
    },
  ).join("");
}

function splitLongWord(
  word: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const chunks: string[] = [];
  let chunk = "";
  for (const character of Array.from(word)) {
    const candidate = chunk + character;
    if (chunk && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
      if (current) {
        lines.push(current);
        current = "";
      }
      const chunks = splitLongWord(word, font, fontSize, maxWidth);
      lines.push(...chunks.slice(0, -1));
      current = chunks[chunks.length - 1] ?? "";
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function fitTextToWidth(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;

  const ellipsis = "...";
  const characters = Array.from(text);
  while (
    characters.length > 0 &&
    font.widthOfTextAtSize(`${characters.join("").trimEnd()}${ellipsis}`, fontSize) >
      maxWidth
  ) {
    characters.pop();
  }
  return `${characters.join("").trimEnd()}${ellipsis}`;
}

function addUriAnnotation(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  uri: string,
) {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;

  const annotation = page.doc.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Link"),
    Rect: [x, y, x + width, y + height],
    Border: [0, 0, 0],
    A: {
      Type: PDFName.of("Action"),
      S: PDFName.of("URI"),
      URI: PDFString.of(parsed.toString()),
    },
  });
  page.node.addAnnot(page.doc.context.register(annotation));
}

export async function buildPartnerLeadPdf(
  data: PartnerLeadPdfData,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const blue = brandColor();
  const fullName = `${data.firstName} ${data.lastName}`.trim() || "Lead";
  const titleFontSize = 21;
  const portalButtonWidth = 154;
  const portalButtonHeight = 32;
  const portalButtonX = PAGE_WIDTH - PAGE_MARGIN - portalButtonWidth;
  const titleMaxWidth = portalButtonX - PAGE_MARGIN - 16;
  const titleBaselineY = PAGE_HEIGHT - 73;
  const titleAscent = bold.heightAtSize(titleFontSize);
  const titleHeight = bold.heightAtSize(titleFontSize, { descender: true });
  const titleDescent = titleHeight - titleAscent;
  const titleCenterY = titleBaselineY + (titleAscent - titleDescent) / 2;
  const portalButtonY = titleCenterY - portalButtonHeight / 2;
  const title = fitTextToWidth(
    safePdfText(fullName, bold),
    bold,
    titleFontSize,
    titleMaxWidth,
  );
  const leadType = safePdfText(data.leadTypeLabel || "Unspecified", regular);
  const portalButtonLabel = "Open in portal";
  const portalButtonLabelSize = 10;
  const portalButtonLabelWidth = bold.widthOfTextAtSize(
    portalButtonLabel,
    portalButtonLabelSize,
  );
  const portalButtonLabelAscent = bold.heightAtSize(portalButtonLabelSize);
  const portalButtonLabelHeight = bold.heightAtSize(portalButtonLabelSize, {
    descender: true,
  });
  const portalButtonLabelDescent =
    portalButtonLabelHeight - portalButtonLabelAscent;
  const portalButtonLabelX =
    portalButtonX + (portalButtonWidth - portalButtonLabelWidth) / 2;
  const portalButtonLabelY =
    portalButtonY +
    (portalButtonHeight - portalButtonLabelHeight) / 2 +
    portalButtonLabelDescent;
  document.setTitle(`${fullName} — Lead details`);
  document.setSubject("Partner lead delivery details");
  document.setCreator("Partner Portal");

  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let bodyTop = PAGE_HEIGHT - 144;
  let columnIndex = 0;
  let cursorY = bodyTop;
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 128,
    width: PAGE_WIDTH,
    height: 128,
    color: NAVY,
  });
  page.drawText("LEAD DELIVERY", {
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - 42,
    size: 8,
    font: bold,
    color: WHITE,
  });
  page.drawText(title, {
    x: PAGE_MARGIN,
    y: titleBaselineY,
    size: titleFontSize,
    font: bold,
    color: WHITE,
    maxWidth: titleMaxWidth,
  });
  page.drawRectangle({
    x: portalButtonX,
    y: portalButtonY,
    width: portalButtonWidth,
    height: portalButtonHeight,
    color: blue,
  });
  page.drawText(portalButtonLabel, {
    x: portalButtonLabelX,
    y: portalButtonLabelY,
    size: portalButtonLabelSize,
    font: bold,
    color: WHITE,
  });
  addUriAnnotation(
    page,
    portalButtonX,
    portalButtonY,
    portalButtonWidth,
    portalButtonHeight,
    data.portalUrl,
  );
  page.drawText(leadType, {
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - 102,
    size: 10,
    font: regular,
    color: WHITE,
    maxWidth: CONTENT_WIDTH,
  });

  const columnX = () =>
    PAGE_MARGIN + columnIndex * (COLUMN_WIDTH + COLUMN_GAP);
  const drawColumnDivider = () => {
    page.drawLine({
      start: {
        x: PAGE_MARGIN + COLUMN_WIDTH + COLUMN_GAP / 2,
        y: bodyTop,
      },
      end: {
        x: PAGE_MARGIN + COLUMN_WIDTH + COLUMN_GAP / 2,
        y: PAGE_BOTTOM,
      },
      thickness: 0.5,
      color: RULE,
    });
  };
  drawColumnDivider();

  const startContinuationPage = () => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawText("LEAD DETAILS · CONTINUED", {
      x: PAGE_MARGIN,
      y: PAGE_HEIGHT - 40,
      size: 8,
      font: bold,
      color: blue,
    });
    page.drawLine({
      start: { x: PAGE_MARGIN, y: PAGE_HEIGHT - 52 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN, y: PAGE_HEIGHT - 52 },
      thickness: 1,
      color: RULE,
    });
    bodyTop = PAGE_HEIGHT - 72;
    columnIndex = 0;
    cursorY = bodyTop;
    drawColumnDivider();
  };

  const advanceColumn = () => {
    if (columnIndex === 0) {
      columnIndex = 1;
      cursorY = bodyTop;
      return;
    }
    startContinuationPage();
  };

  const startSecondColumn = () => {
    if (columnIndex === 0) {
      columnIndex = 1;
      cursorY = bodyTop;
    }
  };

  const ensureSpace = (height: number) => {
    if (cursorY - height < PAGE_BOTTOM) advanceColumn();
  };

  const drawSection = (label: string) => {
    ensureSpace(26);
    const x = columnX();
    page.drawText(safePdfText(label.toUpperCase(), bold), {
      x,
      y: cursorY - 8,
      size: 7.5,
      font: bold,
      color: blue,
    });
    page.drawLine({
      start: { x, y: cursorY - 14 },
      end: { x: x + COLUMN_WIDTH, y: cursorY - 14 },
      thickness: 0.6,
      color: RULE,
    });
    cursorY -= 23;
  };

  const drawField = (
    label: string,
    rawValue: string | null | undefined,
    linkUrl?: string | null,
  ) => {
    const value = normalizedValue(rawValue);
    if (!value) return;

    const safeLabel = safePdfText(label, bold);
    const safeValue = safePdfText(value, regular);
    const fontSize = 9;
    const labelFontSize = 7.5;
    const lines = wrapText(safeValue, regular, fontSize, COLUMN_WIDTH);
    const fieldHeight =
      FIELD_LABEL_GAP +
      lines.length * FIELD_VALUE_LINE_HEIGHT +
      FIELD_BOTTOM_GAP;
    ensureSpace(fieldHeight);
    const x = columnX();
    page.drawText(safeLabel, {
      x,
      y: cursorY - 7,
      size: labelFontSize,
      font: bold,
      color: MUTED,
      maxWidth: COLUMN_WIDTH,
    });
    cursorY -= FIELD_LABEL_GAP;

    for (const line of lines) {
      if (cursorY - (FIELD_VALUE_LINE_HEIGHT - 1) < PAGE_BOTTOM) {
        advanceColumn();
      }
      const lineX = columnX();
      const y = cursorY - 8;
      page.drawText(line, {
        x: lineX,
        y,
        size: fontSize,
        font: regular,
        color: INK,
        maxWidth: COLUMN_WIDTH,
      });
      if (linkUrl) {
        const textWidth = regular.widthOfTextAtSize(line, fontSize);
        addUriAnnotation(page, lineX, y - 1, textWidth, 11, linkUrl);
      }
      cursorY -= FIELD_VALUE_LINE_HEIGHT;
    }
    cursorY -= FIELD_BOTTOM_GAP;
  };

  const fullAddress = [data.address, data.city, data.state, data.zip]
    .map(normalizedValue)
    .filter((part): part is string => part != null)
    .join(", ");

  drawSection("Contact");
  drawField("Name", fullName);
  drawField("Phone", data.phone);
  drawField("Email", data.email);
  drawField("Address", fullAddress);
  drawField("Date of Birth", data.dob);
  drawField("Age", data.age);
  drawField("Type", data.leadTypeLabel);

  drawSection("Lead answers");
  const answerSplitIndex = Math.ceil(data.answers.length / 2);
  for (const answer of data.answers.slice(0, answerSplitIndex)) {
    drawField(answer.label, answer.value);
  }
  const remainingAnswers = data.answers.slice(answerSplitIndex);
  if (remainingAnswers.length) {
    startSecondColumn();
    drawSection("Lead answers (continued)");
    for (const answer of remainingAnswers) {
      drawField(answer.label, answer.value);
    }
  }

  const complianceValues = [
    data.tcpaConsent,
    data.tcpaLanguage,
    data.trustedformCertUrl,
  ];
  if (complianceValues.some((value) => normalizedValue(value) !== null)) {
    drawSection("Consent & compliance");
    drawField("TCPA Consent", data.tcpaConsent);
    drawField("TCPA Language", data.tcpaLanguage);
    drawField("TrustedForm", data.trustedformCertUrl, data.trustedformCertUrl);
  }

  drawSection("Delivery");
  drawField("Channel", data.channel === "realtime" ? "Realtime" : "Aged");
  drawField(
    "Delivered",
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(data.deliveredAt),
  );

  const pages = document.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawText(`${index + 1} / ${pages.length}`, {
      x: PAGE_WIDTH - PAGE_MARGIN - 38,
      y: 22,
      size: 8,
      font: regular,
      color: MUTED,
    });
  });

  return document.save();
}

export async function packagePartnerLeadPdfs(
  files: PartnerLeadPdfFile[],
): Promise<PartnerLeadPdfFile & { kind: "pdf" | "zip" }> {
  if (!files.length) {
    throw new Error("At least one lead PDF is required");
  }
  if (files.length === 1) return { ...files[0], kind: "pdf" };

  const zip = new JSZip();
  for (const file of files) zip.file(file.filename, file.bytes);
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const date = new Date().toISOString().slice(0, 10);
  return {
    kind: "zip",
    filename: `leads-${date}.zip`,
    bytes,
  };
}