CREATE TYPE "LearningSubscriptionMode" AS ENUM ('CURRENT_EDITION', 'FOLLOW_UPDATES');
CREATE TYPE "LearningSubscriptionStatus" AS ENUM ('ACTIVE', 'WAITING', 'COMPLETED', 'PAUSED', 'CANCELLED');

ALTER TABLE "QuestionBank" ADD COLUMN "recommendedSubscriptionMode" "LearningSubscriptionMode" NOT NULL DEFAULT 'CURRENT_EDITION';
ALTER TABLE "KnowledgeBank" ADD COLUMN "recommendedSubscriptionMode" "LearningSubscriptionMode" NOT NULL DEFAULT 'FOLLOW_UPDATES';
ALTER TABLE "Subscription"
  ADD COLUMN "mode" "LearningSubscriptionMode" NOT NULL DEFAULT 'CURRENT_EDITION',
  ADD COLUMN "status" "LearningSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "editionQuestionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "KnowledgeSubscription"
  ADD COLUMN "mode" "LearningSubscriptionMode" NOT NULL DEFAULT 'FOLLOW_UPDATES',
  ADD COLUMN "status" "LearningSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "editionPointIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "KnowledgePushLog" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeliveryJob" ADD COLUMN "subscriptionGeneration" INTEGER NOT NULL DEFAULT 0;

-- Old inactive rows have no stop reason. Preserve them as cancelled, never guess and reactivate.
UPDATE "Subscription" s SET
  "status" = CASE WHEN s."isActive" THEN 'ACTIVE'::"LearningSubscriptionStatus" ELSE 'CANCELLED'::"LearningSubscriptionStatus" END,
  "startedAt" = s."createdAt",
  "editionQuestionIds" = ARRAY(SELECT q."id" FROM "Question" q WHERE q."bankId" = s."bankId" AND q."status" = 'PUBLISHED');
UPDATE "KnowledgeSubscription" SET
  "status" = CASE WHEN "isActive" THEN 'ACTIVE'::"LearningSubscriptionStatus" ELSE 'CANCELLED'::"LearningSubscriptionStatus" END,
  "startedAt" = "createdAt";
UPDATE "DeliveryJob" j SET "subscriptionGeneration" = s."generation"
  FROM "Subscription" s WHERE j."kind" = 'QUESTION' AND j."subscriptionId" = s."id";

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_status_active_check" CHECK ("isActive" = ("status" IN ('ACTIVE', 'WAITING')));
ALTER TABLE "KnowledgeSubscription" ADD CONSTRAINT "KnowledgeSubscription_status_active_check" CHECK ("isActive" = ("status" IN ('ACTIVE', 'WAITING')));
