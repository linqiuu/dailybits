"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QuestionForm } from "@/components/question/question-form";
import { QuestionList } from "@/components/question/question-list";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

export default function EditBankPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: bankId } = React.use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const [bank, setBank] = React.useState<{
    id: string;
    title: string;
    creatorId: string;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [listRefreshKey, setListRefreshKey] = React.useState(0);

  React.useEffect(() => {
    fetch(`/api/banks/${bankId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error);
          router.push("/");
          return;
        }
        setBank(data);
      })
      .catch(() => {
        toast.error("加载失败");
        router.push("/");
      })
      .finally(() => setLoading(false));
  }, [bankId, router]);

  const isCreator =
    !!session?.user?.id && !!bank && bank.creatorId === session.user.id;

  if (loading) {
    return (
      <div className="page-enter flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!bank) {
    return null;
  }

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          {bank.title}
        </h1>
        <Link
          href={`/bank/${bankId}`}
          className="text-sm text-primary hover:underline"
        >
          返回题库
        </Link>
      </div>

      <Tabs defaultValue="manual" className="w-full">
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="manual" className="flex-1">
            手动录入
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex-1">
            题目管理
          </TabsTrigger>
        </TabsList>
        <TabsContent value="manual" className="mt-6">
          {isCreator ? (
            <QuestionForm
              bankId={bankId}
              onSuccess={() => setListRefreshKey((k) => k + 1)}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              仅题库创建者可录入题目
            </p>
          )}
        </TabsContent>
        <TabsContent value="manage" className="mt-6">
          {isCreator ? (
            <QuestionList
              key={listRefreshKey}
              bankId={bankId}
              isCreator={isCreator}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              仅题库创建者可管理题目
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
