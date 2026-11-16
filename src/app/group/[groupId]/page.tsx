import { notFound } from "next/navigation";
import { GroupDashboard } from "@/components/group/group-dashboard";
import { isGroupId } from "@/lib/groups/identity";

interface PageProps {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

export default async function GroupPage({ params, searchParams }: PageProps) {
  const { groupId } = await params;

  if (!isGroupId(groupId)) {
    notFound();
  }

  const { tab } = await searchParams;
  const initialTab = tab === "subscriptions" || tab === "digests" ? tab : "banks";
  return <GroupDashboard key={groupId + initialTab} groupId={groupId} initialTab={initialTab} />;
}
