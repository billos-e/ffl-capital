import { TransactionType } from "@prisma/client";
import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { recordLedgerEntry } from "@/lib/wallet/ledger";

type TxClient = Prisma.TransactionClient;

function paymentIntentIdFrom(
  paymentIntent: string | Stripe.PaymentIntent | null,
): string | undefined {
  if (!paymentIntent) return undefined;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
}

/**
 * Apply a successful Stripe refund for a wallet top-up exactly once.
 *
 * A refund has its own Stripe id, while the original top-up keeps the unique
 * payment-intent id. The separate payment-intent reference lets us aggregate
 * multiple partial refunds without violating the existing unique constraint.
 */
export async function applyStripeTopupRefund(
  refund: Stripe.Refund,
  tx: TxClient,
): Promise<"applied" | "ignored"> {
  if (refund.status !== "succeeded") return "ignored";

  const paymentIntentId = paymentIntentIdFrom(refund.payment_intent);
  if (!paymentIntentId) {
    throw new Error(`Stripe refund ${refund.id} has no payment intent`);
  }

  const existing = await tx.transaction.findUnique({
    where: { stripeRefundId: refund.id },
    select: { id: true },
  });
  if (existing) return "ignored";

  const original = await tx.transaction.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { partnerId: true, type: true, amount: true },
  });
  if (!original) {
    throw new Error(`Top-up transaction not found for ${paymentIntentId}`);
  }
  if (original.type !== TransactionType.top_up) return "ignored";

  const amount = refund.amount / 100;
  if (amount <= 0) return "ignored";

  const previousRefunds = await tx.transaction.aggregate({
    where: {
      type: TransactionType.refund,
      stripeRefundPaymentIntentId: paymentIntentId,
    },
    _sum: { amount: true },
  });
  const alreadyRefunded = Math.abs(Number(previousRefunds._sum.amount ?? 0));
  if (alreadyRefunded + amount > Number(original.amount) + 0.0001) {
    throw new Error(`Stripe refunds exceed top-up amount for ${paymentIntentId}`);
  }

  await recordLedgerEntry({
    partnerId: original.partnerId,
    amount: -amount,
    type: TransactionType.refund,
    description: `Stripe top-up refund: ${refund.id}`,
    stripeRefundId: refund.id,
    stripeRefundPaymentIntentId: paymentIntentId,
    allowNegativeBalance: true,
    tx,
  });

  return "applied";
}