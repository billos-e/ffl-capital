import { TransactionType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type TxClient = Prisma.TransactionClient;

export interface LedgerEntryInput {
  partnerId: string;
  type: TransactionType;
  amount: number;
  description?: string;
  stripePaymentIntentId?: string;
  stripeRefundId?: string;
  stripeRefundPaymentIntentId?: string;
  leadDeliveryId?: string;
  allowNegativeBalance?: boolean;
  tx?: TxClient;
}

/**
 * Append-only wallet ledger. Never update past transactions.
 */
export async function recordLedgerEntry(input: LedgerEntryInput) {
  const run = async (client: TxClient) => {
    const updated = await client.partner.update({
      where: { id: input.partnerId },
      data: { walletBalance: { increment: input.amount } },
      select: { walletBalance: true },
    });

    const newBalance = Number(updated.walletBalance);
    if (newBalance < 0 && !input.allowNegativeBalance) {
      throw new Error("Insufficient wallet balance");
    }

    return client.transaction.create({
      data: {
        partnerId: input.partnerId,
        type: input.type,
        amount: input.amount,
        balanceAfter: newBalance,
        description: input.description,
        stripePaymentIntentId: input.stripePaymentIntentId,
        stripeRefundId: input.stripeRefundId,
        stripeRefundPaymentIntentId: input.stripeRefundPaymentIntentId,
        leadDeliveryId: input.leadDeliveryId,
      },
    });
  };

  if (input.tx) {
    return run(input.tx);
  }

  return prisma.$transaction(run);
}

export async function creditWallet(
  partnerId: string,
  amount: number,
  type: TransactionType,
  options?: Omit<LedgerEntryInput, "partnerId" | "amount" | "type">,
) {
  if (amount <= 0) throw new Error("Credit amount must be positive");
  return recordLedgerEntry({
    partnerId,
    amount,
    type,
    ...options,
  });
}

export async function recordNonWalletTransaction(
  partnerId: string,
  amount: number,
  type: TransactionType,
  options?: Omit<LedgerEntryInput, "partnerId" | "amount" | "type">,
) {
  if (amount === 0) throw new Error("Amount must be non-zero");

  const run = async (client: TxClient) => {
    const partner = await client.partner.findUniqueOrThrow({
      where: { id: partnerId },
      select: { walletBalance: true },
    });

    return client.transaction.create({
      data: {
        partnerId,
        type,
        amount,
        balanceAfter: partner.walletBalance,
        description: options?.description,
        stripePaymentIntentId: options?.stripePaymentIntentId,
        leadDeliveryId: options?.leadDeliveryId,
      },
    });
  };

  if (options?.tx) {
    return run(options.tx);
  }

  return prisma.$transaction(run);
}

export async function debitWallet(
  partnerId: string,
  amount: number,
  type: TransactionType,
  options?: Omit<LedgerEntryInput, "partnerId" | "amount" | "type">,
) {
  if (amount <= 0) throw new Error("Debit amount must be positive");
  return recordLedgerEntry({
    partnerId,
    amount: -amount,
    type,
    ...options,
  });
}
