-- CreateTable: refresh_tokens
-- Stores server-side refresh tokens so they can be revoked on logout.
-- The token column stores the raw random string (not hashed) so lookups
-- are a direct equality check. The @@unique index makes this fast.

CREATE TABLE "refresh_tokens" (
    "id"        TEXT         NOT NULL,
    "token"     TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "refresh_tokens_token_key"   ON "refresh_tokens"("token");
CREATE        INDEX "refresh_tokens_token_idx"   ON "refresh_tokens"("token");
CREATE        INDEX "refresh_tokens_userId_idx"  ON "refresh_tokens"("userId");

-- Foreign key to users
ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
