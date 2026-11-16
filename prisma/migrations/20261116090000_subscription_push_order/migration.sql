CREATE TYPE "SubscriptionPushOrder" AS ENUM ('SEQUENTIAL', 'RANDOM');

ALTER TABLE "Subscription"
ADD COLUMN "pushOrder" "SubscriptionPushOrder" NOT NULL DEFAULT 'SEQUENTIAL';

ALTER TABLE "KnowledgeSubscription"
ADD COLUMN "pushOrder" "SubscriptionPushOrder" NOT NULL DEFAULT 'SEQUENTIAL';
