-- AlterTable
ALTER TABLE "restaurants" ALTER COLUMN "photoNames" DROP DEFAULT;

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "likedCuisines" JSONB NOT NULL DEFAULT '{}',
    "dislikedCuisines" JSONB NOT NULL DEFAULT '{}',
    "priceCounts" JSONB NOT NULL DEFAULT '{}',
    "avgDistance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLikes" INTEGER NOT NULL DEFAULT 0,
    "totalDislikes" INTEGER NOT NULL DEFAULT 0,
    "morningLikes" INTEGER NOT NULL DEFAULT 0,
    "afternoonLikes" INTEGER NOT NULL DEFAULT 0,
    "eveningLikes" INTEGER NOT NULL DEFAULT 0,
    "lateNightLikes" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
