-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "addressNumber" VARCHAR(20),
ADD COLUMN     "city" VARCHAR(100),
ADD COLUMN     "complement" VARCHAR(120),
ADD COLUMN     "neighborhood" VARCHAR(100),
ADD COLUMN     "phone" VARCHAR(20),
ADD COLUMN     "state" VARCHAR(2),
ADD COLUMN     "street" VARCHAR(160),
ADD COLUMN     "zipCode" VARCHAR(9);
