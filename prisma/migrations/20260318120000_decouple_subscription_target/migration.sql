-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('USER', 'GROUP');

-- ============================================================
-- Subscription: userId -> targetType + targetId
-- ============================================================

-- 1. Add new columns (targetType defaults to USER, targetId copies from userId)
ALTER TABLE "Subscription" ADD COLUMN "targetType" "TargetType" NOT NULL DEFAULT 'USER';
ALTER TABLE "Subscription" ADD COLUMN "targetId" TEXT;

-- 2. Migrate existing data: copy userId into targetId
UPDATE "Subscription" SET "targetId" = "userId";

-- 3. Make targetId NOT NULL after data migration
ALTER TABLE "Subscription" ALTER COLUMN "targetId" SET NOT NULL;

-- 4. Set default for pushTimes
ALTER TABLE "Subscription" ALTER COLUMN "pushTimes" SET DEFAULT ARRAY['09:30', '14:00', '17:00'];

-- 5. Drop old unique constraint and foreign key
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_userId_bankId_key";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_userId_fkey";

-- 6. Drop old column
ALTER TABLE "Subscription" DROP COLUMN "userId";

-- 7. Create new unique constraint and index
CREATE UNIQUE INDEX "Subscription_targetType_targetId_bankId_key" ON "Subscription"("targetType", "targetId", "bankId");
CREATE INDEX "Subscription_targetType_targetId_idx" ON "Subscription"("targetType", "targetId");

-- ============================================================
-- PushLog: userId -> targetType + targetId
-- ============================================================

-- 1. Add new columns
ALTER TABLE "PushLog" ADD COLUMN "targetType" "TargetType" NOT NULL DEFAULT 'USER';
ALTER TABLE "PushLog" ADD COLUMN "targetId" TEXT;

-- 2. Migrate existing data
UPDATE "PushLog" SET "targetId" = "userId";

-- 3. Make targetId NOT NULL
ALTER TABLE "PushLog" ALTER COLUMN "targetId" SET NOT NULL;

-- 4. Drop old indexes and foreign key
DROP INDEX IF EXISTS "PushLog_userId_questionId_idx";
DROP INDEX IF EXISTS "PushLog_userId_idx";
ALTER TABLE "PushLog" DROP CONSTRAINT IF EXISTS "PushLog_userId_fkey";

-- 5. Drop old column
ALTER TABLE "PushLog" DROP COLUMN "userId";

-- 6. Create new indexes
CREATE INDEX "PushLog_targetType_targetId_questionId_idx" ON "PushLog"("targetType", "targetId", "questionId");
CREATE INDEX "PushLog_targetType_targetId_idx" ON "PushLog"("targetType", "targetId");
