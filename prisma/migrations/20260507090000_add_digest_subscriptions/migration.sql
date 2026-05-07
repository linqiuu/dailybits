-- CreateEnum
CREATE TYPE "DigestType" AS ENUM ('GITHUB_TRENDING', 'AI_NEWS');

-- CreateTable
CREATE TABLE "DigestSubscription" (
    "id" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL DEFAULT 'USER',
    "targetId" TEXT NOT NULL,
    "digestType" "DigestType" NOT NULL,
    "pushTimes" TEXT[] NOT NULL DEFAULT ARRAY['09:00']::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "subscriberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigestSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestPushLog" (
    "id" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL DEFAULT 'USER',
    "targetId" TEXT NOT NULL,
    "digestType" "DigestType" NOT NULL,
    "digestDate" TEXT NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigestPushLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigestSubscription_targetType_targetId_digestType_key" ON "DigestSubscription"("targetType", "targetId", "digestType");

-- CreateIndex
CREATE INDEX "DigestSubscription_targetType_targetId_idx" ON "DigestSubscription"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "DigestSubscription_digestType_isActive_idx" ON "DigestSubscription"("digestType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DigestPushLog_targetType_targetId_digestType_digestDate_key" ON "DigestPushLog"("targetType", "targetId", "digestType", "digestDate");

-- CreateIndex
CREATE INDEX "DigestPushLog_targetType_targetId_idx" ON "DigestPushLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "DigestPushLog_digestType_digestDate_idx" ON "DigestPushLog"("digestType", "digestDate");

-- AddForeignKey
ALTER TABLE "DigestSubscription" ADD CONSTRAINT "DigestSubscription_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
