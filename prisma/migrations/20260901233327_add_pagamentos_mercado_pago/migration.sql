-- CreateTable
CREATE TABLE "pagamentos" (
    "id" SERIAL NOT NULL,
    "provider" VARCHAR(30) NOT NULL DEFAULT 'MERCADO_PAGO',
    "preferenceId" VARCHAR(120),
    "paymentId" VARCHAR(120),
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "statusDetail" VARCHAR(120),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pedidoId" INTEGER NOT NULL,

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_preferenceId_key" ON "pagamentos"("preferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_paymentId_key" ON "pagamentos"("paymentId");

-- CreateIndex
CREATE INDEX "pagamentos_pedidoId_idx" ON "pagamentos"("pedidoId");

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
