/*
  Warnings:

  - A unique constraint covering the columns `[refundId]` on the table `pagamentos` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "pagamentos" ADD COLUMN     "refundAmount" DECIMAL(10,2),
ADD COLUMN     "refundId" VARCHAR(120),
ADD COLUMN     "refundStatus" VARCHAR(50),
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_refundId_key" ON "pagamentos"("refundId");
