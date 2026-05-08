-- AlterEnum
ALTER TYPE "QuestionSource" ADD VALUE 'LOCAL_SYNC';

-- AlterTable
ALTER TABLE "QuestionBank" ADD COLUMN     "externalSlug" TEXT,
ADD COLUMN     "externalSource" TEXT,
ADD COLUMN     "isOfficial" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "externalContentHash" TEXT,
ADD COLUMN     "externalIdentityHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBank_externalSource_externalSlug_key" ON "QuestionBank"("externalSource", "externalSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Question_bankId_externalIdentityHash_key" ON "Question"("bankId", "externalIdentityHash");
