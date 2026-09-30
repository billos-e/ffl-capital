import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { resolvePartnerAbsoluteUrl } from "@/lib/email/email-layout";
import {
  buildPartnerLeadAnswerFields,
  buildPartnerLeadPdf,
  packagePartnerLeadPdfs,
} from "@/lib/leads/partner-lead-download";
import { MAX_PARTNER_LEAD_DOWNLOADS } from "@/lib/leads/partner-lead-download-constants";
import {
  loadAllCategoryLabels,
} from "@/lib/lead-categories/category-labels";
import { resolveLeadDeliveryTypeLabel } from "@/lib/delivery/lead-payload";

const requestSchema = z.object({
  deliveryIds: z
    .array(z.string().uuid())
    .min(1)
    .max(MAX_PARTNER_LEAD_DOWNLOADS),
});

function filenamePart(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "lead"
  );
}

function pdfFilename(deliveryId: string, firstName: string, lastName: string) {
  return `lead-${filenamePart(firstName)}-${filenamePart(lastName)}-${deliveryId.slice(0, 8)}.pdf`;
}

function attachmentResponse(
  body: Uint8Array,
  contentType: string,
  filename: string,
) {
  const responseBody = Uint8Array.from(body).buffer as ArrayBuffer;
  return new NextResponse(responseBody, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requirePartner();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.error === "unauthenticated" ? 401 : 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: `Select between 1 and ${MAX_PARTNER_LEAD_DOWNLOADS} leads to download`,
      },
      { status: 400 },
    );
  }

  const deliveryIds = [...new Set(parsed.data.deliveryIds)];
  const deliveries = await prisma.leadDelivery.findMany({
    where: {
      id: { in: deliveryIds },
      partnerId: authResult.partner.id,
    },
    include: { lead: true },
  });

  if (deliveries.length !== deliveryIds.length) {
    return NextResponse.json({ error: "One or more leads were not found" }, { status: 404 });
  }

  const categories = await loadAllCategoryLabels();
  const byId = new Map(deliveries.map((delivery) => [delivery.id, delivery]));
  const orderedDeliveries = deliveryIds.map((id) => byId.get(id)!);
  const appOrigin = request.nextUrl.origin;
  const files: Array<{ filename: string; bytes: Uint8Array }> = [];

  try {
    for (const delivery of orderedDeliveries) {
      const lead = delivery.lead;
      const filename = pdfFilename(delivery.id, lead.firstName, lead.lastName);
      const bytes = await buildPartnerLeadPdf({
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        address: lead.address,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        dob: lead.dob,
        age: lead.age,
        leadTypeLabel: resolveLeadDeliveryTypeLabel(lead, categories),
        answers: buildPartnerLeadAnswerFields(lead),
        tcpaConsent: lead.tcpaConsent,
        tcpaLanguage: lead.tcpaLanguage,
        trustedformCertUrl: lead.trustedformCertUrl,
        channel: delivery.channel,
        deliveredAt: delivery.deliveredAt,
        portalUrl: resolvePartnerAbsoluteUrl(
          `/partner/leads/${delivery.id}`,
          appOrigin,
        ),
      });
      files.push({ filename, bytes });
    }

    const download = await packagePartnerLeadPdfs(files);
    return attachmentResponse(
      download.bytes,
      download.kind === "pdf" ? "application/pdf" : "application/zip",
      download.filename,
    );
  } catch (error) {
    console.error(
      "[partner-lead-download] Could not generate requested download",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Could not generate the requested download" },
      { status: 500 },
    );
  }
}