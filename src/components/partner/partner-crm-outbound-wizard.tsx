"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  LEAD_DELIVERY_SOURCE_FIELDS,
  parseTopLevelJsonKeys,
} from "@/lib/crm-outbound/source-fields";
import type { CrmOutboundConfigInput } from "@/lib/crm-outbound/schemas";
import { ActionButton } from "@/components/ui/action-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { WarningCircle } from "@/lib/icons/client";
import { notify } from "@/lib/notify";

type AuthType = CrmOutboundConfigInput["authType"];

type WizardForm = {
  enabled: boolean;
  endpointUrl: string;
  authType: AuthType;
  bearerToken: string;
  apiHeaderName: string;
  apiHeaderValue: string;
  basicUsername: string;
  basicPassword: string;
  bodyFields: { key: string; value: string }[];
  fieldMappings: { source: string; target: string }[];
  require2xx: boolean;
  bodyContains: string;
  bodyRegex: string;
  bodyKeyEqualsKey: string;
  bodyKeyEqualsValue: string;
};

function emptyForm(): WizardForm {
  return {
    enabled: false,
    endpointUrl: "",
    authType: "none",
    bearerToken: "",
    apiHeaderName: "X-Api-Key",
    apiHeaderValue: "",
    basicUsername: "",
    basicPassword: "",
    bodyFields: [{ key: "sid", value: "" }, { key: "authToken", value: "" }],
    fieldMappings: [],
    require2xx: true,
    bodyContains: "",
    bodyRegex: "",
    bodyKeyEqualsKey: "",
    bodyKeyEqualsValue: "",
  };
}

function authConfigFromForm(form: WizardForm): Record<string, unknown> {
  switch (form.authType) {
    case "bearer":
      return { token: form.bearerToken };
    case "api_key_header":
      return { headerName: form.apiHeaderName, headerValue: form.apiHeaderValue };
    case "basic":
      return { username: form.basicUsername, password: form.basicPassword };
    case "body_fields":
      return { fields: form.bodyFields.filter((f) => f.key.trim()) };
    default:
      return {};
  }
}

function formFromApi(data: CrmOutboundConfigInput & { updatedAt?: string }): WizardForm {
  const base = emptyForm();
  base.enabled = data.enabled;
  base.endpointUrl = data.endpointUrl;
  base.authType = data.authType;
  base.fieldMappings = data.fieldMappings;

  const auth = (data.authConfig ?? {}) as Record<string, unknown>;
  if (data.authType === "bearer" && typeof auth.token === "string") base.bearerToken = auth.token;
  if (data.authType === "api_key_header") {
    if (typeof auth.headerName === "string") base.apiHeaderName = auth.headerName;
    if (typeof auth.headerValue === "string") base.apiHeaderValue = auth.headerValue;
  }
  if (data.authType === "basic") {
    if (typeof auth.username === "string") base.basicUsername = auth.username;
    if (typeof auth.password === "string") base.basicPassword = auth.password;
  }
  if (data.authType === "body_fields" && Array.isArray(auth.fields)) {
    base.bodyFields = auth.fields as { key: string; value: string }[];
  }

  const rule = data.successRule ?? { require2xx: true };
  base.require2xx = rule.require2xx !== false;
  base.bodyContains = rule.bodyContains ?? "";
  base.bodyRegex = rule.bodyRegex ?? "";
  base.bodyKeyEqualsKey = rule.bodyKeyEquals?.key ?? "";
  base.bodyKeyEqualsValue = rule.bodyKeyEquals?.value ?? "";

  return base;
}

function isValidHttpUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validateEndpointStep(form: WizardForm): string[] {
  return isValidHttpUrl(form.endpointUrl) ? [] : ["Endpoint URL"];
}

function validateAuthStep(form: WizardForm): string[] {
  switch (form.authType) {
    case "bearer":
      return form.bearerToken.trim() ? [] : ["Bearer token"];
    case "api_key_header": {
      const errors: string[] = [];
      if (!form.apiHeaderName.trim()) errors.push("API header name");
      if (!form.apiHeaderValue.trim()) errors.push("API header value");
      return errors;
    }
    case "basic": {
      const errors: string[] = [];
      if (!form.basicUsername.trim()) errors.push("Basic auth username");
      if (!form.basicPassword.trim()) errors.push("Basic auth password");
      return errors;
    }
    case "body_fields": {
      const fields = form.bodyFields.filter((f) => f.key.trim());
      if (fields.length === 0) return ["Body auth fields"];
      return fields.every((f) => f.value.trim()) ? [] : ["Body auth field values"];
    }
    default:
      return [];
  }
}

function validateMappingStep(form: WizardForm): string[] {
  const hasMapping = form.fieldMappings.some((m) => m.source.trim() && m.target.trim());
  return hasMapping ? [] : ["Field mapping"];
}

function validateSuccessStep(form: WizardForm): string[] {
  if (!form.bodyRegex.trim()) return [];
  try {
    new RegExp(form.bodyRegex);
    return [];
  } catch {
    return ["Valid body regex"];
  }
}

const STEP_VALIDATORS = [
  validateEndpointStep,
  validateAuthStep,
  validateMappingStep,
  validateSuccessStep,
] as const;

function getValidationErrors(form: WizardForm): string[] {
  return STEP_VALIDATORS.flatMap((validate) => validate(form));
}

function isStepComplete(stepIndex: number, form: WizardForm): boolean {
  if (stepIndex < STEP_VALIDATORS.length) {
    return STEP_VALIDATORS[stepIndex](form).length === 0;
  }
  return getValidationErrors(form).length === 0;
}

const DEFAULT_API_HEADER_NAME = "X-Api-Key";

function isStepEmpty(stepIndex: number, form: WizardForm): boolean {
  switch (stepIndex) {
    case 0:
      return !form.endpointUrl.trim();
    case 1:
      if (form.authType === "none") return true;
      switch (form.authType) {
        case "bearer": return !form.bearerToken.trim();
        case "api_key_header":
          return !form.apiHeaderValue.trim() && form.apiHeaderName.trim() === DEFAULT_API_HEADER_NAME;
        case "basic": return !form.basicUsername.trim() && !form.basicPassword.trim();
        case "body_fields": return form.bodyFields.every((f) => !f.value.trim());
        default: return true;
      }
    case 2:
      return form.fieldMappings.length === 0 || form.fieldMappings.every((m) => !m.source.trim() && !m.target.trim());
    case 3:
      return form.require2xx && !form.bodyContains.trim() && !form.bodyRegex.trim() && !form.bodyKeyEqualsKey.trim() && !form.bodyKeyEqualsValue.trim();
    default:
      return false;
  }
}

function buildPayload(form: WizardForm): CrmOutboundConfigInput {
  const successRule: CrmOutboundConfigInput["successRule"] = { require2xx: form.require2xx };
  if (form.bodyContains.trim()) successRule.bodyContains = form.bodyContains.trim();
  if (form.bodyRegex.trim()) successRule.bodyRegex = form.bodyRegex.trim();
  if (form.bodyKeyEqualsKey.trim()) {
    successRule.bodyKeyEquals = { key: form.bodyKeyEqualsKey.trim(), value: form.bodyKeyEqualsValue };
  }
  return {
    enabled: form.enabled,
    endpointUrl: form.endpointUrl.trim(),
    httpMethod: "POST",
    authType: form.authType,
    authConfig: authConfigFromForm(form),
    fieldMappings: form.fieldMappings.filter((m) => m.source.trim() && m.target.trim()),
    successRule,
  };
}

// ─── Design constants ────────────────────────────────────────────────────────

const STEP_LABELS = ["Endpoint", "Auth", "Mapping", "Success", "Test"] as const;

const STEP_TITLES = [
  "Connect your endpoint",
  "Authenticate the request",
  "Map your lead fields",
  "Define success",
  "Review & test",
];

const STEP_DESCS = [
  "Turn on outbound POST and tell us where matched leads should go.",
  "Choose how we prove each POST comes from Capital Lead Solutions. Your secret is encrypted and never shown again.",
  "Tell us which key each piece of lead data uses in your CRM.",
  "Choose how we decide your CRM accepted a lead. All enabled checks must pass.",
  "Confirm the setup, then send a synthetic lead to your endpoint.",
];

const AUTH_NOTES: Record<AuthType, string> = {
  none: "No authentication header will be sent.",
  bearer: "Sent as Authorization: Bearer …",
  api_key_header: "Sent as a custom request header.",
  basic: "Sent as Authorization: Basic … (base64).",
  body_fields: "Injected as keys inside the JSON body.",
};

const AUTH_NAMES: Record<AuthType, string> = {
  none: "None",
  bearer: "Bearer token",
  api_key_header: "API key header",
  basic: "Basic auth",
  body_fields: "Body fields",
};

// Step state colours
const C_ACTIVE  = "#605BFF";
const C_DONE_BG = "rgba(37,182,124,0.13)";
const C_DONE_FG = "#25B67C";
const C_TODO_BG = "#f2f1f8";
const C_TODO_FG = "#b3b3bf";

function stepCircleStyle(i: number, current: number) {
  if (i === current) return { background: C_ACTIVE, color: "#fff" };
  if (i < current)  return { background: C_DONE_BG, color: C_DONE_FG };
  return { background: C_TODO_BG, color: C_TODO_FG };
}
function stepLabelColor(i: number, current: number) {
  if (i === current) return "#030229";
  if (i < current)  return "#4a495c";
  return C_TODO_FG;
}
function barColor(i: number, current: number) {
  return i < current - 1 ? "#c7edcf" : "#eceaf3";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Bordered toggle card used for boolean options */
function ToggleCard({
  label,
  hint,
  checked,
  onCheckedChange,
  id,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#ececf3] bg-white px-[18px] py-4">
      <div>
        <div className="text-sm font-bold text-[#030229]">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-[#8b8a99]">{hint}</div>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/** Remove × button used in mapping and body-fields rows */
function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] border border-[#ececf3] bg-white text-base font-bold text-[#b3b3bf] transition-colors hover:border-red-200 hover:text-red-400"
    >
      ×
    </button>
  );
}

/** Blue-tinted note row (used for auth info) */
function NoteRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl px-3.5 py-3"
      style={{ background: "rgba(96,91,255,0.07)" }}
    >
      {/* shield icon */}
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#605BFF" strokeWidth="2.2" className="flex-shrink-0">
        <path d="M12 2l8 4v5c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V6l8-4z" />
      </svg>
      <span className="text-xs font-bold" style={{ color: "#605BFF" }}>{children}</span>
    </div>
  );
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

export function PartnerCrmOutboundWizard({
  sectionClass,
  showPageChrome = true,
  controlledEnabled,
  onEnabledChange,
}: {
  sectionClass: string;
  showPageChrome?: boolean;
  /** When provided the pill in the parent controls form.enabled. */
  controlledEnabled?: boolean;
  /** Called on load and whenever enabled toggles so the parent can mirror the value. */
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [sampleJson, setSampleJson] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/partners/me/crm-outbound");
      if (res.status === 404) { setConfigured(false); setForm(emptyForm()); onEnabledChange?.(false); return; }
      if (!res.ok) { notify.error("Could not load CRM settings"); return; }
      const data = (await res.json()) as CrmOutboundConfigInput;
      setForm(formFromApi(data));
      setConfigured(true);
      onEnabledChange?.(data.enabled);
    } catch {
      notify.error("Could not load CRM settings");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadConfig(); }, [loadConfig]);

  // Sync the page-level pill → form.enabled
  useEffect(() => {
    if (controlledEnabled !== undefined) {
      setForm((prev) => prev.enabled === controlledEnabled ? prev : { ...prev, enabled: controlledEnabled });
    }
  }, [controlledEnabled]);

  const validationErrors = useMemo(() => getValidationErrors(form), [form]);
  const canSave = validationErrors.length === 0;
  const stepEmpty = isStepEmpty(step, form);
  const stepComplete = isStepComplete(step, form);
  const canAdvanceStep = stepEmpty || stepComplete;

  async function saveConfig(): Promise<boolean> {
    setSaving(true);
    try {
      const body = buildPayload(form);
      const res = await fetch("/api/partners/me/crm-outbound", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { notify.error(data.error ?? "Save failed"); return false; }
      setConfigured(true);
      setForm(formFromApi(data));
      notify.success("CRM outbound settings saved.");
      return true;
    } catch {
      notify.error("Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function finishWizard() {
    if (!canSave || saving) return;
    const saved = await saveConfig();
    if (saved) router.push("/partner/settings");
  }

  async function runTest() {
    setTestResult(null); setTesting(true);
    try {
      if (canSave) await saveConfig();
      const res = await fetch("/api/partners/me/crm-outbound/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { notify.error(data.error ?? "Test failed"); return; }
      if (data.ok) {
        setTestResult({ ok: true, message: `Success — HTTP ${data.statusCode ?? "?"}${data.bodyPreview ? `: ${data.bodyPreview}` : ""}` });
      } else {
        setTestResult({ ok: false, message: `Failed — ${data.error ?? "unknown"}${data.statusCode ? ` (HTTP ${data.statusCode})` : ""}` });
      }
    } catch {
      notify.error("Test request failed");
    } finally {
      setTesting(false);
    }
  }

  async function deleteConfig() {
    if (!configured) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/partners/me/crm-outbound", { method: "DELETE" });
      if (!res.ok) { const data = await res.json(); notify.error(data.error ?? "Delete failed"); return; }
      setConfigured(false);
      setForm(emptyForm());
      setDeleteConfirmOpen(false);
      notify.success("CRM outbound configuration removed.");
    } catch {
      notify.error("Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  function importSampleKeys() {
    try {
      const keys = parseTopLevelJsonKeys(sampleJson);
      setForm((prev) => ({
        ...prev,
        fieldMappings: keys.map((target) => ({
          target,
          source: LEAD_DELIVERY_SOURCE_FIELDS.includes(target as (typeof LEAD_DELIVERY_SOURCE_FIELDS)[number]) ? target : "",
        })),
      }));
      notify.success("Imported target keys from sample JSON.");
      setShowPreview(true);
    } catch {
      notify.error("Invalid sample JSON — use a flat object with top-level keys only.");
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <section id="crm-outbound" className={`${sectionClass} p-6`}>
        <p className="text-sm text-slate-500">Loading CRM outbound settings…</p>
      </section>
    );
  }

  const validMappings = form.fieldMappings.filter((m) => m.source && m.target);

  // Success summary for the test step
  const successParts: string[] = [];
  if (form.require2xx) successParts.push("HTTP 2xx");
  if (form.bodyContains) successParts.push("body contains");
  if (form.bodyRegex) successParts.push("regex");
  if (form.bodyKeyEqualsKey) successParts.push("key equals");

  return (
    <section id="crm-outbound" className={sectionClass}>
      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="px-7 pb-8 pt-7">

        {/* Step stepper */}
        <div className="mb-8 flex items-start justify-center">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center">
              <button
                type="button"
                onClick={() => setStep(i)}
                className="flex flex-col items-center gap-1.5 rounded-lg px-2 py-1 transition-opacity hover:opacity-80"
              >
                <span
                  className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold transition-all"
                  style={stepCircleStyle(i, step)}
                >
                  {i < step ? "✓" : String(i + 1)}
                </span>
                <span
                  className="text-[12px] font-extrabold transition-colors"
                  style={{ color: stepLabelColor(i, step) }}
                >
                  {label}
                </span>
              </button>
              {i < STEP_LABELS.length - 1 && (
                <span
                  className="mb-4 mx-1 h-0.5 w-16 flex-shrink-0 rounded-full transition-colors"
                  style={{ background: barColor(i, step) }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step title + description */}
        <div className="mx-auto max-w-[540px]">
          <h2 className="text-center text-2xl font-extrabold text-[#030229]">
            {STEP_TITLES[step]}
          </h2>
          <p className="mx-auto mt-2 mb-7 max-w-sm text-center text-[13px] leading-relaxed text-[#8b8a99]">
            {STEP_DESCS[step]}
          </p>

          {/* ── Step 0: Endpoint ─────────────────────────────────────── */}
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <ToggleCard
                id="crm-outbound-enabled"
                label="Enable CRM POST on delivery"
                hint="Email delivery always runs separately."
                checked={form.enabled}
                onCheckedChange={(enabled) => {
                  setForm({ ...form, enabled });
                  onEnabledChange?.(enabled);
                }}
              />
              <div>
                <label className="mb-1.5 block text-[13px] font-extrabold text-[#030229]">
                  Endpoint URL
                </label>
                <input
                  type="url"
                  className="form-input font-mono text-sm"
                  value={form.endpointUrl}
                  onChange={(e) => setForm({ ...form, endpointUrl: e.target.value })}
                  placeholder="https://your-crm.example.com/leads"
                />
                <p className="mt-2 text-xs text-[#8b8a99]">
                  A valid http(s) URL. We POST JSON here on each matched lead.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 1: Auth ─────────────────────────────────────────── */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-extrabold text-[#030229]">
                  Authentication method
                </label>
                <select
                  className="form-input"
                  value={form.authType}
                  onChange={(e) => setForm({ ...form, authType: e.target.value as AuthType })}
                >
                  <option value="none">None</option>
                  <option value="bearer">Bearer token</option>
                  <option value="api_key_header">API key header</option>
                  <option value="basic">Basic auth</option>
                  <option value="body_fields">Body fields (SID + token)</option>
                </select>
              </div>

              {form.authType === "none" && (
                <p className="rounded-xl border border-[#ececf3] bg-white px-4 py-3.5 text-[13px] text-[#8b8a99]">
                  No authentication header will be sent.
                </p>
              )}

              {form.authType === "bearer" && (
                <div>
                  <label className="mb-1.5 block text-[13px] font-extrabold text-[#030229]">
                    Bearer token
                  </label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="sk_live_••••••••"
                    value={form.bearerToken}
                    onChange={(e) => setForm({ ...form, bearerToken: e.target.value })}
                  />
                </div>
              )}

              {form.authType === "api_key_header" && (
                <div className="flex flex-wrap gap-3">
                  <div className="flex-1 min-w-[160px]">
                    <label className="mb-1.5 block text-[13px] font-extrabold text-[#030229]">Header name</label>
                    <input
                      className="form-input"
                      placeholder="X-Api-Key"
                      value={form.apiHeaderName}
                      onChange={(e) => setForm({ ...form, apiHeaderName: e.target.value })}
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="mb-1.5 block text-[13px] font-extrabold text-[#030229]">Header value</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="••••••••"
                      value={form.apiHeaderValue}
                      onChange={(e) => setForm({ ...form, apiHeaderValue: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {form.authType === "basic" && (
                <div className="flex flex-wrap gap-3">
                  <div className="flex-1 min-w-[160px]">
                    <label className="mb-1.5 block text-[13px] font-extrabold text-[#030229]">Username</label>
                    <input
                      className="form-input"
                      placeholder="username"
                      value={form.basicUsername}
                      onChange={(e) => setForm({ ...form, basicUsername: e.target.value })}
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="mb-1.5 block text-[13px] font-extrabold text-[#030229]">Password</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="••••••••"
                      value={form.basicPassword}
                      onChange={(e) => setForm({ ...form, basicPassword: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {form.authType === "body_fields" && (
                <div>
                  <label className="mb-2 block text-[13px] font-extrabold text-[#030229]">Body auth fields</label>
                  <div className="flex flex-col gap-2">
                    {form.bodyFields.map((row, idx) => (
                      <div key={idx} className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 34px" }}>
                        <input
                          className="form-input font-mono text-sm"
                          placeholder="key"
                          value={row.key}
                          onChange={(e) => {
                            const bodyFields = [...form.bodyFields];
                            bodyFields[idx] = { ...row, key: e.target.value };
                            setForm({ ...form, bodyFields });
                          }}
                        />
                        <input
                          type="password"
                          className="form-input"
                          placeholder="value"
                          value={row.value}
                          onChange={(e) => {
                            const bodyFields = [...form.bodyFields];
                            bodyFields[idx] = { ...row, value: e.target.value };
                            setForm({ ...form, bodyFields });
                          }}
                        />
                        <RemoveBtn onClick={() => setForm({ ...form, bodyFields: form.bodyFields.filter((_, i) => i !== idx) })} />
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mt-3 text-[13px] font-bold text-brand-600 hover:underline"
                    onClick={() => setForm({ ...form, bodyFields: [...form.bodyFields, { key: "", value: "" }] })}
                  >
                    + Add field
                  </button>
                </div>
              )}

              <NoteRow>{AUTH_NOTES[form.authType]}</NoteRow>
            </div>
          )}

          {/* ── Step 2: Mapping ──────────────────────────────────────── */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              {/* Sample JSON importer */}
              <div className="rounded-xl border border-dashed border-[#e0def0] bg-[#fbfbfe] p-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[13px] font-extrabold text-[#030229]">
                    Auto-import from sample JSON
                  </span>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={importSampleKeys}
                  >
                    Parse keys
                  </button>
                </div>
                <textarea
                  className="form-input min-h-[72px] font-mono text-xs"
                  placeholder='{"first_name":"", "email":"", "phone":""}'
                  value={sampleJson}
                  onChange={(e) => setSampleJson(e.target.value)}
                />
              </div>

              {/* Mapping rows */}
              <div>
                <div className="mb-2 grid gap-2 text-[13px] font-extrabold text-[#030229]" style={{ gridTemplateColumns: "1fr 26px 1fr 34px" }}>
                  <span>Lead field</span>
                  <span />
                  <span>CRM key</span>
                  <span />
                </div>
                <div className="flex flex-col gap-2">
                  {form.fieldMappings.map((row, idx) => (
                    <div key={idx} className="grid items-center gap-2" style={{ gridTemplateColumns: "1fr 26px 1fr 34px" }}>
                      <select
                        className="form-input text-sm"
                        value={row.source}
                        onChange={(e) => {
                          const fieldMappings = [...form.fieldMappings];
                          fieldMappings[idx] = { ...row, source: e.target.value };
                          setForm({ ...form, fieldMappings });
                        }}
                      >
                        <option value="">— select —</option>
                        {LEAD_DELIVERY_SOURCE_FIELDS.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                      <span className="text-center text-sm font-bold text-[#b3b3bf]">→</span>
                      <input
                        className="form-input font-mono text-sm"
                        placeholder="crm_key"
                        value={row.target}
                        onChange={(e) => {
                          const fieldMappings = [...form.fieldMappings];
                          fieldMappings[idx] = { ...row, target: e.target.value };
                          setForm({ ...form, fieldMappings });
                        }}
                      />
                      <RemoveBtn onClick={() => setForm({ ...form, fieldMappings: form.fieldMappings.filter((_, i) => i !== idx) })} />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-3 text-[13px] font-bold text-brand-600 hover:underline"
                  onClick={() => setForm({ ...form, fieldMappings: [...form.fieldMappings, { source: "", target: "" }] })}
                >
                  + Add mapping row
                </button>
              </div>

              {/* Payload preview */}
              {validMappings.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-[#ececf3] px-4 py-3 text-left text-[13px] font-bold text-[#4a495c] transition-colors hover:bg-slate-50"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={clsx("flex-shrink-0 transition-transform", showPreview && "rotate-90")}>
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Preview payload ({validMappings.length} field{validMappings.length !== 1 ? "s" : ""})
                  </button>
                  {showPreview && (
                    <div className="mt-2 rounded-xl bg-[#0f1030] px-4 py-4 font-mono text-xs leading-7">
                      <span className="text-[#5b5a80]">{"{"}</span>
                      {validMappings.map((m, i) => (
                        <div key={i} className="pl-4">
                          <span className="text-[#8b93ff]">&quot;{m.target}&quot;</span>
                          <span className="text-[#c9c8f0]">: </span>
                          <span className="text-[#7ee0a8]">&quot;…&quot;</span>
                          {i < validMappings.length - 1 && <span className="text-[#5b5a80]">,</span>}
                        </div>
                      ))}
                      <span className="text-[#5b5a80]">{"}"}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Success ──────────────────────────────────────── */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <ToggleCard
                id="crm-success-require-2xx"
                label="Require HTTP 2xx"
                hint="Require a 200–299 status code from your CRM endpoint."
                checked={form.require2xx}
                onCheckedChange={(require2xx) => setForm({ ...form, require2xx })}
              />

              <div>
                <label className="mb-1.5 block text-[13px] font-extrabold text-[#030229]">
                  Body contains
                </label>
                <input
                  className="form-input"
                  value={form.bodyContains}
                  onChange={(e) => setForm({ ...form, bodyContains: e.target.value })}
                  placeholder='e.g. "success"'
                />
                <p className="mt-1.5 text-xs text-[#8b8a99]">Raw response body must include this exact text (case-sensitive).</p>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-extrabold text-[#030229]">
                  Body regex
                </label>
                <input
                  className="form-input font-mono text-xs"
                  value={form.bodyRegex}
                  onChange={(e) => setForm({ ...form, bodyRegex: e.target.value })}
                  placeholder='"status"\s*:\s*"success"'
                />
                <p className="mt-1.5 text-xs text-[#8b8a99]">Response body must match this JavaScript regular expression.</p>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-extrabold text-[#030229]">
                  Body key equals
                </label>
                <div className="flex flex-wrap gap-3">
                  <input
                    className="form-input flex-1 min-w-[140px] font-mono text-sm"
                    placeholder="status"
                    value={form.bodyKeyEqualsKey}
                    onChange={(e) => setForm({ ...form, bodyKeyEqualsKey: e.target.value })}
                  />
                  <input
                    className="form-input flex-1 min-w-[140px] font-mono text-sm"
                    placeholder="success"
                    value={form.bodyKeyEqualsValue}
                    onChange={(e) => setForm({ ...form, bodyKeyEqualsValue: e.target.value })}
                  />
                </div>
                <p className="mt-1.5 text-xs text-[#8b8a99]">Parse response as JSON and require a top-level key to equal this value.</p>
              </div>
            </div>
          )}

          {/* ── Step 4: Test & save ──────────────────────────────────── */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              {/* Summary card */}
              <div className="flex flex-col gap-3 rounded-xl border border-[#ececf3] bg-white p-4">
                {[
                  { label: "Endpoint", value: form.endpointUrl || "—" },
                  { label: "Auth", value: AUTH_NAMES[form.authType] },
                  { label: "Fields mapped", value: validMappings.length ? `${validMappings.length} field${validMappings.length !== 1 ? "s" : ""}` : "None" },
                  { label: "Success rule", value: successParts.length ? successParts.join(" + ") : "None" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-baseline justify-between gap-4">
                    <span className="flex-shrink-0 text-[13px] font-bold text-[#8b8a99]">{label}</span>
                    <span className="truncate text-right font-mono text-[13px] font-bold text-[#4a495c]">{value}</span>
                  </div>
                ))}
              </div>

              {/* Validation warnings */}
              {validationErrors.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
                  <WarningCircle size={16} className="mt-0.5 flex-shrink-0 text-amber-500" aria-hidden />
                  <p><span className="font-bold">Missing:</span> {validationErrors.join(", ")}</p>
                </div>
              )}

              {/* Test result */}
              {testResult && (
                <div
                  className="rounded-xl px-4 py-3.5 text-[13.5px] font-bold"
                  style={{
                    background: testResult.ok ? "rgba(37,182,124,0.1)" : "rgba(239,68,68,0.08)",
                    color: testResult.ok ? C_DONE_FG : "#dc2626",
                  }}
                >
                  {testResult.message}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <ActionButton
                  type="button"
                  variant="secondary"
                  loading={testing}
                  onClick={() => void runTest()}
                  disabled={!canSave || testing}
                >
                  {testing ? "Testing…" : "Test connection"}
                </ActionButton>
                {configured && (
                  <ActionButton
                    type="button"
                    variant="secondary"
                    loading={deleting}
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={deleting}
                    className="text-red-500 hover:border-red-200"
                  >
                    Delete config
                  </ActionButton>
                )}
              </div>
            </div>
          )}

          {/* ── Footer nav ───────────────────────────────────────────── */}
          <div className="mt-8 flex items-center justify-between border-t border-[#f0eef6] pt-5">
            <button
              type="button"
              className="btn-secondary btn-sm"
              style={{ visibility: step === 0 ? "hidden" : "visible" }}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              ← Back
            </button>

            <div className="flex items-center gap-2.5">
              {step < STEP_LABELS.length - 1 ? (
                <>
                  {!canAdvanceStep && (
                    <span className="text-xs font-semibold text-[#b3b3bf]">
                      Fill in required fields to continue
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    disabled={!canAdvanceStep}
                    onClick={() => setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
                  >
                    {stepEmpty ? "Skip" : "Next →"}
                  </button>
                </>
              ) : (
                <ActionButton
                  type="button"
                  variant="primary"
                  className="btn-sm"
                  loading={saving}
                  loadingText="Saving…"
                  onClick={() => void finishWizard()}
                  disabled={!canSave || saving}
                >
                  Save configuration
                </ActionButton>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteConfirmOpen(false);
        }}
        title="Remove CRM configuration?"
        description="Remove CRM outbound configuration? You'll need to set it up again to post leads to your CRM."
        confirmLabel="Remove configuration"
        variant="danger"
        loading={deleting}
        onConfirm={() => void deleteConfig()}
      />
    </section>
  );
}
