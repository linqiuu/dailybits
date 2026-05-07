CREATE TABLE "DigestCache" (
    "id" TEXT NOT NULL,
    "digestType" "DigestType" NOT NULL,
    "digestDate" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigestCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DigestCache_digestType_digestDate_key" ON "DigestCache"("digestType", "digestDate");

CREATE INDEX "DigestCache_digestDate_idx" ON "DigestCache"("digestDate");
