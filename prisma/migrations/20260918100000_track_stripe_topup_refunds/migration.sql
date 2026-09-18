ALTER TABLE "transactions"
ADD COLUMN "stripe_refund_id" TEXT,
ADD COLUMN "stripe_refund_payment_intent_id" TEXT;

CREATE UNIQUE INDEX "transactions_stripe_refund_id_key"
ON "transactions"("stripe_refund_id");

CREATE INDEX "transactions_stripe_refund_payment_intent_id_idx"
ON "transactions"("stripe_refund_payment_intent_id");