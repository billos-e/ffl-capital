import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePartner } from "@/lib/auth/session";
import { isPartnerRefundAllowed } from "@/lib/refunds/eligibility";

const bulkSchema = z.object({
  requests: z
    .array(
      z.object({
        leadDeliveryId: z.string().uuid(),
        refundType: z.literal("invalid_phone"),
        reason: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(request: NextRequest) {
  const authResult = await requirePartner();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 403 });
  }

  const body = await request.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const created: string[] = [];
  const errors: Array<{ leadDeliveryId: string; error: string }> = [];

  for (const req of parsed.data.requests) {
    try {
      const delivery = await prisma.leadDelivery.findUnique({
        where: { id: req.leadDeliveryId },
        include: { lead: true, refundRequests: true },
      });

      if (!delivery || delivery.partnerId !== authResult.partner.id) {
        errors.push({ leadDeliveryId: req.leadDeliveryId, error: "Not found" });
        continue;
      }
      if (!isPartnerRefundAllowed(delivery.channel)) {
        errors.push({
          leadDeliveryId: req.leadDeliveryId,
          error: "Aged leads are not refundable by partners",
        });
        continue;
      }
      if (delivery.refundedAt) {
        errors.push({ leadDeliveryId: req.leadDeliveryId, error: "Already refunded" });
        continue;
      }
      if (!delivery.lead.refundable) {
        errors.push({ leadDeliveryId: req.leadDeliveryId, error: "Not refundable" });
        continue;
      }
      if (delivery.refundRequests.some((r) => r.status === "pending")) {
        errors.push({ leadDeliveryId: req.leadDeliveryId, error: "Already pending" });
        continue;
      }

      const refundRequest = await prisma.refundRequest.create({
        data: {
          leadDeliveryId: delivery.id,
          partnerId: authResult.partner.id,
          refundType: req.refundType,
          reason: req.reason,
        },
      });
      created.push(refundRequest.id);
    } catch (err) {
      errors.push({
        leadDeliveryId: req.leadDeliveryId,
        error: err instanceof Error ? err.message : "Failed",
      });
    }
  }

  return NextResponse.json({ created, errors });
}
