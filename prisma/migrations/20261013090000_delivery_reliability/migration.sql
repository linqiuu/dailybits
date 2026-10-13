ALTER TABLE "User" ADD COLUMN "departmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "KnowledgeBank" ADD COLUMN "visibleDepartmentNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Subscription" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PushLog" ADD COLUMN "subscriptionId" TEXT,
  ADD COLUMN "cycle" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryJobId" TEXT;
CREATE UNIQUE INDEX "PushLog_deliveryJobId_key" ON "PushLog"("deliveryJobId");
CREATE INDEX "PushLog_subscriptionId_generation_cycle_idx" ON "PushLog"("subscriptionId", "generation", "cycle");
UPDATE "PushLog" log SET "subscriptionId" = subscription."id", "cycle" = subscription."currentCycle"
FROM "Question" question, "Subscription" subscription
WHERE log."questionId" = question."id" AND subscription."bankId" = question."bankId"
  AND subscription."targetType" = log."targetType" AND subscription."targetId" = log."targetId";

CREATE TYPE "DeliveryKind" AS ENUM ('QUESTION', 'KNOWLEDGE', 'DIGEST');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'ACCEPTED', 'FAILED', 'CANCELLED', 'UNKNOWN');
CREATE TABLE "DeliveryJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "dedupeKey" TEXT NOT NULL,
  "kind" "DeliveryKind" NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "targetType" "TargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "scheduleDate" TEXT NOT NULL,
  "pushTime" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockToken" TEXT,
  "payload" JSONB,
  "receipt" JSONB,
  "externalMessageId" TEXT,
  "lastErrorCode" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "DeliveryJob_dedupeKey_key" ON "DeliveryJob"("dedupeKey");
CREATE INDEX "DeliveryJob_status_nextAttemptAt_idx" ON "DeliveryJob"("status", "nextAttemptAt");
CREATE INDEX "DeliveryJob_targetType_targetId_scheduledAt_idx" ON "DeliveryJob"("targetType", "targetId", "scheduledAt");
CREATE INDEX "DeliveryJob_kind_scheduledAt_idx" ON "DeliveryJob"("kind", "scheduledAt");
CREATE UNIQUE INDEX "DeliveryJob_one_processing_per_subscription" ON "DeliveryJob"("kind", "subscriptionId") WHERE "status" = 'PROCESSING';
CREATE TABLE "SchedulerState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "lastTickAt" TIMESTAMP(3) NOT NULL,
  "lastErrorCode" TEXT,
  "cursor" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
