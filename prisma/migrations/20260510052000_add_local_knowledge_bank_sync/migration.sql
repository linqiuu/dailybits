-- AlterTable
ALTER TABLE "KnowledgeBank" ADD COLUMN "externalSource" TEXT,
ADD COLUMN "externalSlug" TEXT;

-- AlterTable
ALTER TABLE "KnowledgePoint" ADD COLUMN "externalContentHash" TEXT,
ADD COLUMN "externalIdentityHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBank_externalSource_externalSlug_key" ON "KnowledgeBank"("externalSource", "externalSlug");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePoint_bankId_externalIdentityHash_key" ON "KnowledgePoint"("bankId", "externalIdentityHash");
