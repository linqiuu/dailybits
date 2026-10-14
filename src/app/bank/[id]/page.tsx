import { notFound } from "next/navigation";
import { canAccessBank, getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BankDetailClient } from "./bank-detail-client";
import { SubscriptionPanel, type SubscriptionSummary } from "@/components/bank/subscription-panel";
import { questionProgress } from "@/lib/subscriptions/lifecycle";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BankDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getCurrentSession();

  const bank = await prisma.questionBank.findUnique({
    where: { id },
    include: {
      creator: {
        select: { id: true, name: true, image: true, uid: true },
      },
      questions: {
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: { questions: true },
      },
    },
  });

  if (!bank || (!canAccessBank(bank, session) && !session?.user.isAdmin)) {
    notFound();
  }

  const isCreator = session?.user?.id === bank.creatorId;
  const canViewAnswers = isCreator || session?.user.isAdmin === true;

  let initialSubscription: SubscriptionSummary | null = null;
  let pushedCount = 0;
  let totalQuestions = bank.questions.filter(question => question.status === "PUBLISHED").length;

  if (session?.user?.id) {
    const sub = await
      prisma.subscription.findUnique({
        where: {
          targetType_targetId_bankId: {
            targetType: "USER",
            targetId: session.user.id,
            bankId: id,
          },
        },
      });
    if (sub) {
      initialSubscription = sub;
      const progress = await questionProgress(prisma, sub);
      pushedCount = progress.pushedCount;
      totalQuestions = progress.questionCount;
    }
  }

  return (
    <div className="page-enter space-y-6">
      <BankDetailClient
        bank={{
          id: bank.id,
          title: bank.title,
          description: bank.description,
          creatorId: bank.creatorId,
          subscriberCount: bank.subscriberCount,
          subscriptionScheduleMode: bank.subscriptionScheduleMode,
          subscriptionCadence: bank.subscriptionCadence,
          subscriptionWeekdays: bank.subscriptionWeekdays,
          subscriptionPushTimes: bank.subscriptionPushTimes,
          creator: bank.creator,
          questions: bank.questions.filter((question) => isCreator || question.status === "PUBLISHED"),
          questionCount: bank.questions.filter((question) => isCreator || question.status === "PUBLISHED").length,
        }}
        isCreator={isCreator}
        canViewAnswers={canViewAnswers}
        subscriptionSlot={
          session?.user?.id ? (
            <SubscriptionPanel
              bankId={bank.id}
              recommendedMode={bank.recommendedSubscriptionMode}
              bankSchedule={{
                subscriptionScheduleMode: bank.subscriptionScheduleMode,
                subscriptionCadence: bank.subscriptionCadence,
                subscriptionWeekdays: bank.subscriptionWeekdays,
                subscriptionPushTimes: bank.subscriptionPushTimes,
              }}
              initialSubscription={initialSubscription}
              totalQuestions={totalQuestions}
              pushedCount={pushedCount}
            />
          ) : null
        }
      />
    </div>
  );
}
