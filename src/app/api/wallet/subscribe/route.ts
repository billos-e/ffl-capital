import { NextRequest, NextResponse } from "next/server";
import { BillingInterval } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePartner } from "@/lib/auth/session";
import { resolveAppOrigin } from "@/lib/email/email-layout";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";

const subscribeSchema = z.object({
  amount: z.number().min(25).max(5000),
});

export async function GET() {
  const authResult = await requirePartner();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 403 });
  }

  const subscription = await prisma.billingRecurrence.findFirst({
    where: { partnerId: authResult.partner.id, active: true },
    orderBy: { createdAt: "desc" },
    select: { active: true, amount: true, interval: true, nextChargeAt: true },
  });

  if (!subscription) {
    return NextResponse.json(null);
  }

  return NextResponse.json({
    active: subscription.active,
    amount: Number(subscription.amount),
    interval: subscription.interval,
    nextChargeAt: subscription.nextChargeAt?.toISOString() ?? null,
  });
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

  const body = await request.json();
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid amount (min $25)" }, { status: 400 });
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

  const activeRecurrence = await prisma.billingRecurrence.findFirst({
    where: {
      partnerId: partner.id,
      active: true,
      stripeSubscriptionId: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });

  if (activeRecurrence?.stripeSubscriptionId) {
    await stripe.subscriptions.cancel(activeRecurrence.stripeSubscriptionId);
    await prisma.billingRecurrence.update({
      where: { id: activeRecurrence.id },
      data: { active: false, nextChargeAt: null, stripeSubscriptionId: null },
    });
  }

  const existing = await prisma.billingRecurrence.findFirst({
    where: { partnerId: partner.id },
    orderBy: { createdAt: "desc" },
  });

  let billingRecurrenceId: string;
  if (existing) {
    await prisma.billingRecurrence.update({
      where: { id: existing.id },
      data: { amount: parsed.data.amount, active: false, nextChargeAt: null },
    });
    billingRecurrenceId = existing.id;
  } else {
    const created = await prisma.billingRecurrence.create({
      data: {
        partnerId: partner.id,
        amount: parsed.data.amount,
        interval: BillingInterval.weekly,
        active: false,
      },
    });
    billingRecurrenceId = created.id;
  }

  const amountCents = Math.round(parsed.data.amount * 100);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          recurring: { interval: "week" },
          product_data: {
            name: "Capital Lead Solutions Weekly Auto-Recharge",
          },
        },
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata: { partnerId: partner.id },
    },
    metadata: {
      partnerId: partner.id,
      type: "subscription",
      billingRecurrenceId,
    },
    success_url: `${origin}/partner/wallet?subscribe=success`,
    cancel_url: `${origin}/partner/wallet?subscribe=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}

export async function DELETE(_request: NextRequest) {
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

  const existing = await prisma.billingRecurrence.findFirst({
    where: { partnerId: authResult.partner.id, active: true },
    orderBy: { createdAt: "desc" },
  });

  if (!existing) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
  }

  if (existing.stripeSubscriptionId) {
    const stripe = getStripe();
    await stripe.subscriptions.cancel(existing.stripeSubscriptionId);
  }

  await prisma.billingRecurrence.update({
    where: { id: existing.id },
    data: { active: false, nextChargeAt: null },
  });

  return NextResponse.json({ success: true });
}
