-- refresh_tokens.token is @unique, which Prisma already indexes via
-- refresh_tokens_token_key. The separate @@index([token]) added in
-- 20260511000001_add_refresh_tokens created a second, functionally
-- identical index (refresh_tokens_token_idx) on the same single column --
-- pure overhead on every write to this table for zero query benefit.

DROP INDEX "refresh_tokens_token_idx";
