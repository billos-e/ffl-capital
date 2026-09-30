import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { buildPartnerLeadAnswerFields } from "@/lib/leads/partner-lead-download";
import { MAX_PARTNER_LEAD_DOWNLOADS } from "@/lib/leads/partner-lead-download-constants";
import { buildPartnerLeadsCsv } from "@/lib/leads/partner-lead-csv";
import { resolveLeadDeliveryTypeLabel } from "@/lib/delivery/lead-payload";
import { loadAllCategoryLabels } from "@/lib/lead-categories/category-labels";

const requestSchema = z.object({
  deliveryIds: z
    .array(z.string().uuid())
    .min(1)
    .max(MAX_PARTNER_LEAD_DOWNLOADS),
});

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
    return NextResponse.json(
      { error: "One or more leads were not found" },
      { status: 404 },
    );
  }

  try {
    const categories = await loadAllCategoryLabels();
    const byId = new Map(deliveries.map((delivery) => [delivery.id, delivery]));
    const csv = buildPartnerLeadsCsv(
      deliveryIds.map((id) => {
        const delivery = byId.get(id)!;
        const lead = delivery.lead;
        return {
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
          price: delivery.price.toString(),
          refundedAt: delivery.refundedAt,
          deliveredAt: delivery.deliveredAt,
        };
      }),
    );

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${date}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(
      "[partner-lead-csv] Could not generate requested export",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Could not generate the requested CSV" },
      { status: 500 },
    );
  }
}