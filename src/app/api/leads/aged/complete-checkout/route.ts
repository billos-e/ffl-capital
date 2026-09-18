import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { fulfillAgedCheckout } from "@/lib/aged/fulfill-aged-checkout";

const completeSchema = z.object({
  sessionId: z.string().min(1),
});

function paymentIntentIdFrom(value: unknown): string | undefined {
  if (!value) return undefined;
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: NextRequest) {
  const authResult = await requirePartner();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 403 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured on this environment" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId);
  if (session.metadata?.partnerId !== authResult.partner.id) {
    return NextResponse.json({ error: "Checkout not found" }, { status: 404 });
  }
  if (session.metadata?.type !== "aged_purchase") {
    return NextResponse.json({ error: "Not an aged checkout" }, { status: 400 });
  }
  if (session.payment_status !== "paid") {
    return NextResponse.json({ error: "Payment not completed" }, { status: 409 });
  }

  const checkoutId = session.metadata.agedCheckoutId;
  if (!checkoutId) {
    return NextResponse.json({ error: "Checkout metadata missing" }, { status: 400 });
  }

  const checkout = await prisma.agedCheckout.findUnique({
    where: { id: checkoutId },
  });
  if (!checkout || checkout.partnerId !== authResult.partner.id) {
    return NextResponse.json({ error: "Checkout not found" }, { status: 404 });
  }

  const paymentIntentId = paymentIntentIdFrom(session.payment_intent);
  const result = await fulfillAgedCheckout({
    checkoutId,
    partnerId: authResult.partner.id,
    paymentIntentId,
  });

  return NextResponse.json({
    ok: true,
    purchasedCount: result.purchasedCount,
    failedCount: result.failedCount,
    purchased: result.purchased.map((lead) => ({
      leadId: lead.leadId,
      firstName: lead.firstName,
      lastName: lead.lastName,
    })),
  });
}
