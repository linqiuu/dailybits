import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BankDetailClient } from "./bank-detail-client";
import { SubscriptionPanel } from "@/components/bank/subscription-panel";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BankDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

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

  if (!bank) {
    notFound();
  }

  const isCreator = session?.user?.id === bank.creatorId;

  let initialSubscription: {
    id: string;
    pushTimes: string[];
    isActive: boolean;
    endCondition: "END_AFTER_COMPLETE" | "REPEAT_N_TIMES";
    repeatCount: number;
  } | null = null;
  let pushedCount = 0;

  if (session?.user?.id) {
    const [sub, pushed] = await Promise.all([
      prisma.subscription.findUnique({
        where: {
          targetType_targetId_bankId: {
            targetType: "USER",
            targetId: session.user.id,
            bankId: id,
          },
        },
        select: {
          id: true,
          pushTimes: true,
          isActive: true,
          endCondition: true,
          repeatCount: true,
        },
      }),
      prisma.pushLog.findMany({
        where: {
          targetType: "USER",
          targetId: session.user.id,
          question: { bankId: id },
        },
        select: { questionId: true },
        distinct: ["questionId"],
      }),
    ]);
    if (sub) {
      initialSubscription = {
        id: sub.id,
        pushTimes: sub.pushTimes,
        isActive: sub.isActive,
        endCondition: sub.endCondition,
        repeatCount: sub.repeatCount,
      };
    }
    pushedCount = pushed.length;
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
          creator: bank.creator,
          questions: bank.questions,
          questionCount: bank._count.questions,
        }}
        isCreator={isCreator}
        subscriptionSlot={
          session?.user?.id ? (
            <SubscriptionPanel
              bankId={bank.id}
              initialSubscription={initialSubscription}
              totalQuestions={bank._count.questions}
              pushedCount={pushedCount}
            />
          ) : null
        }
      />
    </div>
  );
}
