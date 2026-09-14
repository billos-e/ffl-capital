/**
 * Derive readable label/value rows from a lead's intake `rawPayload` for the
 * "Other fields" detail section.
 *
 * Omission approach: skip payload keys that map to fields already shown in the
 * curated Contact / IUL / Compliance / Tracking panels (and name in the header),
 * including common LeadConduit + camelCase aliases from normalize-lead. Nested
 * objects are flattened with dotted paths; empty/null/undefined values are skipped.
 */

export type OtherPayloadField = {
  key: string;
  label: string;
  value: string;
};

/** Payload keys (case-insensitive) already covered by curated lead detail panels. */
const CURATED_PAYLOAD_KEYS = new Set(
  [
    // Contact / header
    "First_Name",
    "firstName",
    "Last_Name",
    "lastName",
    "Email",
    "email",
    "Primary_Phone",
    "phone",
    "Address",
    "address",
    "City",
    "city",
    "State",
    "state",
    "Zip",
    "zip",
    "DOB",
    "dob",
    "Age",
    "age",
    // IUL / product
    "Intent",
    "intent",
    "Have_IUL",
    "haveIul",
    "Primary_Goal",
    "primaryGoal",
    "State_You_Currently_Live_In",
    "stateYouCurrentlyLiveIn",
    "Lead_Type",
    "leadTypeBoberdoo",
    "boberdooLeadType",
    // Compliance
    "Trusted_Form_URL",
    "trustedformCertUrl",
    "trustedform_cert_url",
    "trusted_form_url",
    "TCPA_Consent",
    "tcpaConsent",
    "TCPA_Language",
    "tcpaLanguage",
    "LeadiD_Token",
    "leadidToken",
    // Tracking
    "SRC",
    "source",
    "Landing_Page",
    "landingPage",
    "Sub_ID",
    "subId",
    "Pub_ID",
    "pubId",
    "Unique_Identifier",
    "externalId",
    "IP_Address",
    "ipAddress",
    "User_Agent",
    "userAgent",
  ].map((k) => k.toLowerCase()),
);

export function humanizePayloadKey(key: string): string {
  return key
    .split(".")
    .map((segment) =>
      segment
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    )
    .filter(Boolean)
    .join(" · ");
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0
  ) {
    return true;
  }
  return false;
}

function formatScalar(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  return null;
}

function flattenEntries(
  input: unknown,
  prefix = "",
): Array<{ key: string; value: unknown }> {
  if (isEmptyValue(input)) return [];

  if (Array.isArray(input)) {
    const formatted = input
      .map((item) => formatScalar(item) ?? (typeof item === "object" ? JSON.stringify(item) : null))
      .filter((v): v is string => v != null && v !== "");
    if (formatted.length === 0) return [];
    return [{ key: prefix || "value", value: formatted.join(", ") }];
  }

  if (typeof input !== "object") {
    return prefix ? [{ key: prefix, value: input }] : [];
  }

  const out: Array<{ key: string; value: unknown }> = [];
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${rawKey}` : rawKey;
    if (isEmptyValue(rawValue)) continue;

    if (
      rawValue !== null &&
      typeof rawValue === "object" &&
      !Array.isArray(rawValue)
    ) {
      out.push(...flattenEntries(rawValue, key));
      continue;
    }

    if (Array.isArray(rawValue)) {
      out.push(...flattenEntries(rawValue, key));
      continue;
    }

    out.push({ key, value: rawValue });
  }
  return out;
}

function topLevelKey(path: string): string {
  const dot = path.indexOf(".");
  return dot === -1 ? path : path.slice(0, dot);
}

function isPhoneLikePayloadKey(path: string): boolean {
  return path.split(".").some((segment) => {
    const normalized = segment.replace(/[^a-z0-9]/gi, "").toLowerCase();
    return (
      normalized === "phone" ||
      normalized === "telephone" ||
      normalized === "mobile" ||
      normalized === "cell" ||
      normalized.startsWith("phone") ||
      normalized.startsWith("telephone") ||
      normalized.startsWith("mobile") ||
      normalized.endsWith("phone") ||
      normalized.endsWith("telephone") ||
      normalized.endsWith("mobile")
    );
  });
}

export function extractOtherPayloadFields(
  rawPayload: unknown,
  options?: { omitKeys?: Iterable<string> },
): OtherPayloadField[] {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return [];
  }

  const extraOmit = new Set(
    [...(options?.omitKeys ?? [])].map((k) => k.toLowerCase()),
  );

  const fields: OtherPayloadField[] = [];
  for (const { key, value } of flattenEntries(rawPayload)) {
    const root = topLevelKey(key);
    if (isPhoneLikePayloadKey(key)) continue;
    if (CURATED_PAYLOAD_KEYS.has(root.toLowerCase())) continue;
    if (extraOmit.has(root.toLowerCase()) || extraOmit.has(key.toLowerCase())) {
      continue;
    }

    const formatted = formatScalar(value);
    if (formatted == null) continue;

    fields.push({
      key,
      label: humanizePayloadKey(key),
      value: formatted,
    });
  }

  return fields;
}
