import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePartner } from "@/lib/auth/session";
import { isPartnerRefundAllowed } from "@/lib/refunds/eligibility";

const refundSchema = z.object({
  leadDeliveryId: z.string().uuid(),
  refundType: z.literal("invalid_phone"),
  reason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const authResult = await requirePartner();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 403 });
  }

  const body = await request.json();
  const parsed = refundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const delivery = await prisma.leadDelivery.findUnique({
    where: { id: parsed.data.leadDeliveryId },
    include: { lead: true, refundRequests: true },
  });

  if (!delivery || delivery.partnerId !== authResult.partner.id) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }
  if (!isPartnerRefundAllowed(delivery.channel)) {
    return NextResponse.json(
      { error: "Aged leads are not refundable by partners" },
      { status: 400 },
    );
  }
  if (delivery.refundedAt) {
    return NextResponse.json({ error: "Already refunded" }, { status: 400 });
  }
  if (!delivery.lead.refundable) {
    return NextResponse.json({ error: "Lead is not refundable" }, { status: 400 });
  }
  if (delivery.refundRequests.some((r) => r.status === "pending")) {
    return NextResponse.json({ error: "Refund already pending" }, { status: 400 });
  }

  const refundRequest = await prisma.refundRequest.create({
    data: {
      leadDeliveryId: delivery.id,
      partnerId: authResult.partner.id,
      refundType: parsed.data.refundType,
      reason: parsed.data.reason,
    },
  });

  return NextResponse.json({ refundRequest });
}
