import { notFound } from "next/navigation";
import { GroupDashboard } from "@/components/group/group-dashboard";

interface PageProps {
  params: Promise<{ groupId: string }>;
}

export default async function GroupPage({ params }: PageProps) {
  const { groupId } = await params;

  if (!/^\d+$/.test(groupId)) {
    notFound();
  }

  return (
    <div className="page-enter space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl font-semibold tracking-wide">
          群组看板
        </h1>
        <p className="text-muted-foreground">
          管理群组的题库订阅与推送配置
        </p>
      </header>
      <GroupDashboard groupId={groupId} />
    </div>
  );
}
