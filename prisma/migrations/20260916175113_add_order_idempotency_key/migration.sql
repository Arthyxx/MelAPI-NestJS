/*
  Warnings:

  - A unique constraint covering the columns `[clienteId,idempotencyKey]` on the table `pedidos` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "idempotencyKey" VARCHAR(100);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_clienteId_idempotencyKey_key" ON "pedidos"("clienteId", "idempotencyKey");
