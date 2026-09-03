/*
  Warnings:

  - A unique constraint covering the columns `[googleSub]` on the table `clientes` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "googleSub" VARCHAR(255),
ALTER COLUMN "password" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "clientes_googleSub_key" ON "clientes"("googleSub");
