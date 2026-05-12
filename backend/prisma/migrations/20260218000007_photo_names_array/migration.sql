-- Add photoNames array and migrate from photoName
ALTER TABLE "restaurants" ADD COLUMN "photoNames" TEXT[] NOT NULL DEFAULT '{}';
UPDATE "restaurants" SET "photoNames" = ARRAY["photoName"]::TEXT[] WHERE "photoName" IS NOT NULL;
ALTER TABLE "restaurants" DROP COLUMN "photoName";
