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
        select: { id: true, name: true, image: true },
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
  } | null = null;
  let pushedCount = 0;

  if (session?.user?.id && !isCreator) {
    const [sub, pushed] = await Promise.all([
      prisma.subscription.findUnique({
        where: {
          userId_bankId: {
            userId: session.user.id,
            bankId: id,
          },
        },
      }),
      prisma.pushLog.findMany({
        where: {
          userId: session.user.id,
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
      />
      {!isCreator && session?.user?.id && (
        <SubscriptionPanel
          bankId={bank.id}
          initialSubscription={initialSubscription}
          totalQuestions={bank._count.questions}
          pushedCount={pushedCount}
        />
      )}
    </div>
  );
}
