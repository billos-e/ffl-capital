/** Shared partner transactional email chrome (inline CSS only). */

export const PARTNER_EMAIL_BRAND = "#0B3D91";

/** Matches app `Plus_Jakarta_Sans` / `--font-sans` with email-safe fallbacks. */
export const PARTNER_EMAIL_FONT_STACK =
  "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

const PARTNER_EMAIL_FONT_LINK = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600&display=swap" rel="stylesheet">
`.trim();

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeHtmlMultiline(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br/>");
}

/** Strip trailing slash from an origin/base URL. */
export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * True when the host is loopback / local-only (unsafe for outbound email links).
 * Covers localhost, 127.0.0.1, and *.localhost (with or without port).
 */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const parsed = new URL(
      origin.includes("://") ? origin : `http://${origin}`,
    );
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return true;
  }
}

function originFromReplitDomains(): string | null {
  const replitDomains = process.env.REPLIT_DOMAINS ?? "";
  const firstDomain = replitDomains
    .split(",")
    .map((d) => d.trim())
    .find(Boolean);
  if (!firstDomain) return null;
  const host = firstDomain.replace(/^https?:\/\//i, "");
  return `https://${host}`;
}

/**
 * Resolve the public app origin for absolute email / redirect links.
 * Prefer NEXT_PUBLIC_APP_URL when set and non-loopback; then REPLIT_DOMAINS;
 * then an explicit origin only if it is not loopback; finally local-dev fallback.
 */
export function resolveAppOrigin(explicitOrigin?: string | null): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) {
    const normalized = stripTrailingSlash(fromEnv);
    if (!isLoopbackOrigin(normalized)) return normalized;
  }

  const fromReplit = originFromReplitDomains();
  if (fromReplit) return stripTrailingSlash(fromReplit);

  const fromExplicit = explicitOrigin?.trim();
  if (fromExplicit) {
    const normalized = stripTrailingSlash(fromExplicit);
    if (!isLoopbackOrigin(normalized)) return normalized;
  }

  return "http://localhost:3000";
}

export function resolvePartnerAbsoluteUrl(
  path: string,
  explicitOrigin?: string | null,
): string {
  const origin = resolveAppOrigin(explicitOrigin);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
}

export function partnerEmailCtaButton(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px">
      <tr>
        <td style="background:${PARTNER_EMAIL_BRAND};border-radius:4px">
          <a href="${escapeHtml(href)}"
             style="display:inline-block;padding:12px 22px;font-family:${PARTNER_EMAIL_FONT_STACK};font-size:15px;line-height:1.2;color:#ffffff;text-decoration:none;font-weight:600">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `.trim();
}

export function partnerEmailFieldRows(
  rows: Array<{ label: string; value: string | null | undefined }>,
): string {
  return rows
    .filter((row) => {
      if (row.value == null) return false;
      return String(row.value).trim() !== "";
    })
    .map(
      (row) => `
      <tr>
        <td style="padding:10px 16px 10px 0;border-bottom:1px solid #e8e8e8;color:#64748b;font-size:13px;vertical-align:top;width:140px;font-family:${PARTNER_EMAIL_FONT_STACK}">
          ${escapeHtml(row.label)}
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #e8e8e8;color:#0f172a;font-size:14px;vertical-align:top;font-family:${PARTNER_EMAIL_FONT_STACK};word-break:break-word">
          ${escapeHtml(String(row.value))}
        </td>
      </tr>`,
    )
    .join("");
}

export function wrapPartnerEmailHtml(params: {
  title?: string;
  bodyHtml: string;
  footerNote?: string;
}): string {
  const titleBlock = params.title
    ? `<h1 style="margin:0 0 20px;font-family:${PARTNER_EMAIL_FONT_STACK};font-size:22px;line-height:1.3;font-weight:600;color:#0f172a">${escapeHtml(params.title)}</h1>`
    : "";

  const footer = params.footerNote
    ? `<p style="margin:32px 0 0;font-family:${PARTNER_EMAIL_FONT_STACK};font-size:12px;line-height:1.5;color:#94a3b8">${escapeHtml(params.footerNote)}</p>`
    : "";
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${PARTNER_EMAIL_FONT_LINK}
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:${PARTNER_EMAIL_FONT_STACK}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff">
    <tr>
      <td style="padding:0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto">
          <tr>
            <td style="height:4px;line-height:4px;font-size:0;background:${PARTNER_EMAIL_BRAND}">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 36px">
              <p style="margin:0 0 24px;font-family:${PARTNER_EMAIL_FONT_STACK};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b">
                Capital Lead Solutions · Partner Portal
              </p>
              ${titleBlock}
              <div style="font-family:${PARTNER_EMAIL_FONT_STACK};font-size:15px;line-height:1.55;color:#0f172a">
                ${params.bodyHtml}
              </div>
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
