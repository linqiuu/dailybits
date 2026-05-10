import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canAccessKnowledgeBank } from "@/lib/knowledge/access";
import { prisma } from "@/lib/prisma";
import { KnowledgeDetailClient } from "./knowledge-detail-client";

export default async function KnowledgeBankPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const bank = await prisma.knowledgeBank.findUnique({
    where: { id },
    include: {
      creator: {
        select: { id: true, name: true, image: true, uid: true },
      },
      points: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        take: 100,
      },
      _count: { select: { points: true } },
    },
  });

  if (!bank) notFound();
  const allowed = await canAccessKnowledgeBank(bank, session?.user?.id);
  if (!allowed) notFound();

  const subscription = session?.user?.id
    ? await prisma.knowledgeSubscription.findUnique({
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
        },
      })
    : null;

  return (
    <div className="page-enter">
      <KnowledgeDetailClient
        bank={{
          ...bank,
          pointCount: bank._count.points,
        }}
        isCreator={bank.creatorId === session?.user?.id}
        isLoggedIn={!!session?.user?.id}
        subscription={subscription?.isActive ? subscription : null}
      />
    </div>
  );
}
