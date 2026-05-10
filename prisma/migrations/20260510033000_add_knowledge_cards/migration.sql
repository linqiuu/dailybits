-- CreateTable
CREATE TABLE "KnowledgeBank" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "creatorId" TEXT NOT NULL,
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "visibleDepartments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generationPrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgePoint" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSubscription" (
    "id" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL DEFAULT 'USER',
    "targetId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "pushTimes" TEXT[] DEFAULT ARRAY['09:00']::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "subscriberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgePushLog" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL DEFAULT 'USER',
    "targetId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "contentSnapshot" TEXT NOT NULL,
    "pushDate" TEXT NOT NULL,
    "pushTime" TEXT NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgePushLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgePoint_bankId_orderIndex_idx" ON "KnowledgePoint"("bankId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeSubscription_targetType_targetId_bankId_key" ON "KnowledgeSubscription"("targetType", "targetId", "bankId");

-- CreateIndex
CREATE INDEX "KnowledgeSubscription_targetType_targetId_idx" ON "KnowledgeSubscription"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePushLog_subscriptionId_pushDate_pushTime_key" ON "KnowledgePushLog"("subscriptionId", "pushDate", "pushTime");

-- CreateIndex
CREATE INDEX "KnowledgePushLog_targetType_targetId_idx" ON "KnowledgePushLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "KnowledgePushLog_bankId_pushedAt_idx" ON "KnowledgePushLog"("bankId", "pushedAt");

-- AddForeignKey
ALTER TABLE "KnowledgeBank" ADD CONSTRAINT "KnowledgeBank_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgePoint" ADD CONSTRAINT "KnowledgePoint_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "KnowledgeBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSubscription" ADD CONSTRAINT "KnowledgeSubscription_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "KnowledgeBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSubscription" ADD CONSTRAINT "KnowledgeSubscription_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgePushLog" ADD CONSTRAINT "KnowledgePushLog_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "KnowledgeSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgePushLog" ADD CONSTRAINT "KnowledgePushLog_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
