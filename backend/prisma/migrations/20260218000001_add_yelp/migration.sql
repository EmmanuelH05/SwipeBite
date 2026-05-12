-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN "yelpId" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "address" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_yelpId_key" ON "restaurants"("yelpId");
