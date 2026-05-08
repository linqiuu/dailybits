ALTER TABLE "DigestPushLog"
ADD COLUMN "pushTime" TEXT NOT NULL DEFAULT '09:00';

DROP INDEX IF EXISTS "DigestPushLog_targetType_targetId_digestType_digestDate_key";

ALTER TABLE "DigestPushLog"
ADD CONSTRAINT "DigestPushLog_targetType_targetId_digestType_digestDate_pushTime_key"
UNIQUE ("targetType", "targetId", "digestType", "digestDate", "pushTime");
