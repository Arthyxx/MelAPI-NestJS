-- CreateEnum
CREATE TYPE "StatusCheckoutPedido" AS ENUM ('CRIANDO', 'PRONTO', 'FALHOU');

-- CreateTable
CREATE TABLE "checkout_pedidos" (
    "id" SERIAL NOT NULL,
    "provider" VARCHAR(30) NOT NULL DEFAULT 'MERCADO_PAGO',
    "preferenceId" VARCHAR(120),
    "checkoutUrl" VARCHAR(1000),
    "status" "StatusCheckoutPedido" NOT NULL DEFAULT 'CRIANDO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pedidoId" INTEGER NOT NULL,

    CONSTRAINT "checkout_pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkout_pedidos_preferenceId_key" ON "checkout_pedidos"("preferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_pedidos_pedidoId_key" ON "checkout_pedidos"("pedidoId");

-- CreateIndex
CREATE INDEX "pedidos_status_paymentExpiresAt_idx" ON "pedidos"("status", "paymentExpiresAt");

-- AddForeignKey
ALTER TABLE "checkout_pedidos" ADD CONSTRAINT "checkout_pedidos_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
