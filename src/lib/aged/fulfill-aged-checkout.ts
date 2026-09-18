import {
  AgedCheckoutStatus,
  DeliveryChannel,
  LeadEventType,
  TransactionType,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PRISMA_TX_OPTIONS } from "@/lib/db-transaction";
import { deliverLead } from "@/lib/delivery/deliver-lead";
import { emitLeadEvent } from "@/lib/leads/lead-events";
import { purchaseAgedLeads } from "@/lib/aged/purchase-aged-leads";
import { releaseAgedCheckoutHold } from "@/lib/aged/create-aged-checkout";

type TxClient = Prisma.TransactionClient;

async function getCompletedAgedPurchases(
  tx: TxClient,
  checkout: {
    id: string;
    partnerId: string;
    leadIds: string[];
    createdAt: Date;
    updatedAt: Date;
  },
) {
  const deliveries = await tx.leadDelivery.findMany({
    where: {
      partnerId: checkout.partnerId,
      leadId: { in: checkout.leadIds },
      channel: DeliveryChannel.aged,
      createdAt: {
        gte: checkout.createdAt,
        lte: checkout.updatedAt,
      },
      transactions: {
        some: { type: TransactionType.aged_purchase },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      leadId: true,
      lead: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  return deliveries.map((delivery) => ({
    leadId: delivery.leadId,
    deliveryId: delivery.id,
    firstName: delivery.lead.firstName,
    lastName: delivery.lead.lastName,
  }));
}

export type AgedCheckoutFulfillment = {
  purchasedCount: number;
  failedCount: number;
  alreadyPaid: boolean;
  deliveryIds: string[];
  purchased: Array<{
    leadId: string;
    deliveryId: string;
    firstName: string;
    lastName: string;
  }>;
  partnerId: string;
};

export async function fulfillAgedCheckout(input: {
  checkoutId: string;
  partnerId: string;
  paymentIntentId?: string;
  tx?: TxClient;
  deliver?: boolean;
}): Promise<AgedCheckoutFulfillment> {
  const deliver = input.deliver ?? !input.tx;

  const run = async (tx: TxClient): Promise<AgedCheckoutFulfillment> => {
    // The browser return and Stripe webhook can finalize the same checkout at
    // nearly the same time. Serialize those attempts so both cannot observe a
    // pending checkout and create duplicate deliveries.
    await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "aged_checkouts"
      WHERE "id" = CAST(${input.checkoutId} AS uuid)
      FOR UPDATE
    `;

    const checkout = await tx.agedCheckout.findUnique({
      where: { id: input.checkoutId },
    });
    if (!checkout) {
      throw new Error("Aged checkout not found");
    }
    if (checkout.partnerId !== input.partnerId) {
      throw new Error("Aged checkout partner mismatch");
    }
    if (checkout.status === AgedCheckoutStatus.paid) {
      const purchased = await getCompletedAgedPurchases(tx, checkout);
      return {
        purchasedCount: purchased.length,
        failedCount: 0,
        alreadyPaid: true,
        deliveryIds: [],
        purchased,
        partnerId: checkout.partnerId,
      };
    }
    if (checkout.status !== AgedCheckoutStatus.pending) {
      throw new Error("Aged checkout is no longer pending");
    }

    const result = await purchaseAgedLeads(checkout.partnerId, checkout.leadIds, {
      stripePaymentIntentId: input.paymentIntentId,
      checkoutId: checkout.id,
      skipDelivery: true,
      tx,
    });

    await tx.agedCheckout.update({
      where: { id: checkout.id },
      data: { status: AgedCheckoutStatus.paid },
    });

    return {
      purchasedCount: result.purchased.length,
      failedCount: result.failed.length,
      alreadyPaid: false,
      deliveryIds: result.purchased.map((row) => row.deliveryId),
      purchased: result.purchased.map((row) => ({
        leadId: row.leadId,
        deliveryId: row.deliveryId,
        firstName: row.firstName,
        lastName: row.lastName,
      })),
      partnerId: checkout.partnerId,
    };
  };

  const result = input.tx
    ? await run(input.tx)
    : await prisma.$transaction(run, PRISMA_TX_OPTIONS);

  if (deliver && !result.alreadyPaid) {
    await deliverAgedCheckoutPurchases(result);
  }

  return result;
}

export async function deliverAgedCheckoutPurchases(
  result: Pick<AgedCheckoutFulfillment, "purchased" | "partnerId">,
): Promise<void> {
  for (const row of result.purchased) {
    await deliverLead(row.deliveryId);
    await emitLeadEvent(row.leadId, LeadEventType.aged_purchased, {
      deliveryId: row.deliveryId,
      partnerId: result.partnerId,
    });
  }
}

export async function expireAgedCheckoutByStripeSession(
  stripeCheckoutSessionId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  const checkout = await client.agedCheckout.findUnique({
    where: { stripeCheckoutSessionId },
  });
  if (!checkout || checkout.status !== AgedCheckoutStatus.pending) return;
  await releaseAgedCheckoutHold(checkout.id, tx);
}
