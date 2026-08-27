-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "shippingAddressNumber" VARCHAR(20),
ADD COLUMN     "shippingCity" VARCHAR(100),
ADD COLUMN     "shippingCompanyName" VARCHAR(100),
ADD COLUMN     "shippingComplement" VARCHAR(120),
ADD COLUMN     "shippingDeliveryTime" INTEGER,
ADD COLUMN     "shippingNeighborhood" VARCHAR(100),
ADD COLUMN     "shippingPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "shippingServiceId" VARCHAR(50),
ADD COLUMN     "shippingServiceName" VARCHAR(100),
ADD COLUMN     "shippingState" VARCHAR(2),
ADD COLUMN     "shippingStreet" VARCHAR(160),
ADD COLUMN     "shippingZipCode" VARCHAR(8);
