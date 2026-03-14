import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BankDetailClient } from "./bank-detail-client";

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
    </div>
  );
}
