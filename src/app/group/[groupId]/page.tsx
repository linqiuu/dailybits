import { notFound } from "next/navigation";
import { GroupDashboard } from "@/components/group/group-dashboard";
import { isGroupId } from "@/lib/groups/identity";

interface PageProps {
  params: Promise<{ groupId: string }>;
}

export default async function GroupPage({ params }: PageProps) {
  const { groupId } = await params;

  if (!isGroupId(groupId)) {
    notFound();
  }

  return <GroupDashboard key={groupId} groupId={groupId} />;
}
