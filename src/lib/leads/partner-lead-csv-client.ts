"use client";

export async function downloadPartnerLeadsCsv(
  deliveryIds: string[],
  fallbackErrorMessage: string,
): Promise<void> {
  if (!deliveryIds.length) {
    throw new Error("At least one lead is required.");
  }

  const response = await fetch("/api/partner/leads/download/csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deliveryIds }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error || fallbackErrorMessage);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("Content-Disposition") ?? "";
  const filename =
    contentDisposition.match(/filename="([^"]+)"/i)?.[1] ?? "leads.csv";
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  try {
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
  }
}