/*
  Registra no pedido qual pagamento foi aceito como pagamento oficial.

  Para dados históricos, o backfill é propositalmente conservador:
  apenas pedidos com exatamente um pagamento Mercado Pago aprovado
  recebem paidPaymentId automaticamente.

  Pedidos com zero ou mais de um pagamento aprovado permanecem NULL
  para não escolher arbitrariamente uma cobrança vencedora.
*/

-- AlterTable
ALTER TABLE "pedidos"
ADD COLUMN "paidPaymentId" VARCHAR(120);

-- Backfill seguro dos pedidos históricos
WITH "pagamentos_aprovados_unicos" AS (
  SELECT
    "pedidoId",
    MAX("paymentId") AS "paymentId"
  FROM "pagamentos"
  WHERE
    "provider" = 'MERCADO_PAGO'
    AND "status" = 'approved'
    AND "paymentId" IS NOT NULL
  GROUP BY "pedidoId"
  HAVING COUNT(*) = 1
)
UPDATE "pedidos" AS "pedido"
SET "paidPaymentId" = "pagamento"."paymentId"
FROM "pagamentos_aprovados_unicos" AS "pagamento"
WHERE "pedido"."id" = "pagamento"."pedidoId";

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_paidPaymentId_key"
ON "pedidos"("paidPaymentId");