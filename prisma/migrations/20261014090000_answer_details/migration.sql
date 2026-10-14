CREATE TYPE "AnswerIdentityStatus" AS ENUM ('PENDING', 'RESOLVED', 'NOT_FOUND');

ALTER TABLE "QuestionAnswerEvent"
  ADD COLUMN "respondentUserId" TEXT,
  ADD COLUMN "respondentNameSnapshot" TEXT,
  ADD COLUMN "respondentEmployeeNoSnapshot" TEXT,
  ADD COLUMN "identityStatus" "AnswerIdentityStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "identityCapturedAt" TIMESTAMP(3),
  ADD COLUMN "identityNextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "identityBackfilled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "questionContentSnapshot" TEXT;

ALTER TABLE "QuestionAnswerEvent" ALTER COLUMN "identityBackfilled" SET DEFAULT false;
CREATE INDEX "QuestionAnswerEvent_identityStatus_identityNextAttemptAt_idx"
  ON "QuestionAnswerEvent"("identityStatus", "identityNextAttemptAt");
CREATE INDEX "QuestionAnswerEvent_respondentUserId_answeredAt_idx"
  ON "QuestionAnswerEvent"("respondentUserId", "answeredAt");
