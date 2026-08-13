import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePartner } from "@/lib/auth/session";
import { resolveAppOrigin } from "@/lib/email/email-layout";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";

const checkoutSchema = z.object({
  amount: z.number().min(25).max(10000),
});

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

  const body = await request.json();
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid amount (min $25)" },
      { status: 400 },
    );
  }

  const partner = await prisma.partner.findUniqueOrThrow({
    where: { id: authResult.partner.id },
  });
  const stripe = getStripe();
  const origin = resolveAppOrigin(request.headers.get("origin"));

  let customerId = partner.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: authResult.partner.email,
      name: `${partner.firstName} ${partner.lastName}`,
      metadata: { partnerId: partner.id },
    });
    customerId = customer.id;
    await prisma.partner.update({
      where: { id: partner.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const amountCents = Math.round(parsed.data.amount * 100);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: "Capital Lead Solutions Wallet Top-Up",
            description: "One-time wallet credit for lead purchases",
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      partnerId: partner.id,
      type: "top_up",
    },
    success_url: `${origin}/partner/wallet?checkout=success`,
    cancel_url: `${origin}/partner/wallet?checkout=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
