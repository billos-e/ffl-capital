import {
  DeliveryChannel,
  LeadEventType,
  PartnerStatus,
  TransactionType,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PRISMA_TX_OPTIONS } from "@/lib/db-transaction";
import {
  buildAgedLeadWhere,
  getNextAgedBracketStart,
  AGED_RETIRED_SENTINEL,
} from "@/lib/aged/eligibility";
import {
  resolveAgedPriceForReceivedAt,
  type AgedPriceTier,
} from "@/lib/aged/price-tiers";
import { deliverLead } from "@/lib/delivery/deliver-lead";
import { emitLeadEvent } from "@/lib/leads/lead-events";
import { recordNonWalletTransaction } from "@/lib/wallet/ledger";
import {
  getAgedPriceTiers,
  getDefaultAgedPrice,
} from "@/lib/settings/app-settings";

export interface AgedPurchaseResult {
  purchased: Array<{
    leadId: string;
    deliveryId: string;
    firstName: string;
    lastName: string;
  }>;
  failed: Array<{ leadId: string; reason: string }>;
}

type TxClient = Prisma.TransactionClient;

export async function purchaseAgedLeads(
  partnerId: string,
  leadIds: string[],
  options?: {
    stripePaymentIntentId?: string;
    checkoutId?: string;
    skipDelivery?: boolean;
    tx?: TxClient;
  },
): Promise<AgedPurchaseResult> {
  const partner = await (options?.tx ?? prisma).partner.findUniqueOrThrow({
    where: { id: partnerId },
  });

  if (partner.status !== PartnerStatus.active) {
    throw new Error("Partner account is not active");
  }

  const [fallbackPrice, tiers] = await Promise.all([
    getDefaultAgedPrice(),
    getAgedPriceTiers(),
  ]);
  const purchased: AgedPurchaseResult["purchased"] = [];
  const failed: AgedPurchaseResult["failed"] = [];

  for (const leadId of leadIds) {
    try {
      const { deliveryId, firstName, lastName } = await purchaseSingleAgedLead(
        partnerId,
        leadId,
        tiers,
        fallbackPrice,
        options,
      );
      purchased.push({ leadId, deliveryId, firstName, lastName });
    } catch (err) {
      failed.push({
        leadId,
        reason: err instanceof Error ? err.message : "Purchase failed",
      });
    }
  }

  return { purchased, failed };
}

async function purchaseSingleAgedLead(
  partnerId: string,
  leadId: string,
  tiers: AgedPriceTier[],
  fallbackPrice: number,
  options?: {
    stripePaymentIntentId?: string;
    checkoutId?: string;
    skipDelivery?: boolean;
    tx?: TxClient;
  },
): Promise<{ deliveryId: string; firstName: string; lastName: string }> {
  const agedWhere = await buildAgedLeadWhere(undefined, {
    heldByCheckoutId: options?.checkoutId,
  });
  const run = async (tx: TxClient) => {
    const lead = await tx.lead.findFirst({
      where: {
        AND: [{ id: leadId }, agedWhere],
      },
    });

    if (!lead) throw new Error("Lead not available for aged purchase");

    const agedPrice = resolveAgedPriceForReceivedAt(
      lead.receivedAt,
      tiers,
      fallbackPrice,
    );

    const delivery = await tx.leadDelivery.create({
      data: {
        leadId: lead.id,
        partnerId,
        channel: DeliveryChannel.aged,
        price: agedPrice,
      },
    });

    // A single Stripe PaymentIntent can cover several aged leads. Keep the
    // external payment reference on the first ledger row only because the
    // column is intentionally unique for webhook idempotency on wallet
    // payments. Every lead still gets its own transaction and delivery row.
    let paymentIntentId = options?.stripePaymentIntentId;
    if (paymentIntentId) {
      const existingPayment = await tx.transaction.findFirst({
        where: { stripePaymentIntentId: paymentIntentId },
        select: { id: true },
      });
      if (existingPayment) paymentIntentId = undefined;
    }

    await recordNonWalletTransaction(
      partnerId,
      -agedPrice,
      TransactionType.aged_purchase,
      {
        tx,
        leadDeliveryId: delivery.id,
        stripePaymentIntentId: paymentIntentId,
        description: `Aged lead purchase: ${lead.state}`,
      },
    );

    const newSaleCount = lead.agedSaleCount + 1;
    let agedAvailableAfter: Date | null = null;

    if (newSaleCount >= 2) {
      agedAvailableAfter = AGED_RETIRED_SENTINEL;
    } else {
      const nextBracket = getNextAgedBracketStart(lead.receivedAt, tiers);
      agedAvailableAfter = nextBracket ?? AGED_RETIRED_SENTINEL;
    }

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        agedSaleCount: newSaleCount,
        agedAvailableAfter,
        agedHoldCheckoutId: null,
        agedHoldExpiresAt: null,
      },
    });

    return {
      deliveryId: delivery.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      agedPrice,
    };
  };

  const result = options?.tx
    ? await run(options.tx)
    : await prisma.$transaction(run, PRISMA_TX_OPTIONS);

  if (!options?.skipDelivery) {
    await deliverLead(result.deliveryId);
    const delivery = await prisma.leadDelivery.findUnique({
      where: { id: result.deliveryId },
    });
    if (delivery) {
      await emitLeadEvent(leadId, LeadEventType.aged_purchased, {
        deliveryId: result.deliveryId,
        partnerId,
        price: result.agedPrice,
      });
    }
  }

  return {
    deliveryId: result.deliveryId,
    firstName: result.firstName,
    lastName: result.lastName,
  };
}
