"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface BankCardProps {
  id: string;
  title: string;
  creator: { id: string; name: string | null; image: string | null };
  questionCount: number;
  subscriberCount: number;
}

export function BankCard({
  id,
  title,
  creator,
  questionCount,
  subscriberCount,
}: BankCardProps) {
  return (
    <Card className="card-hover">
      <CardHeader>
        <CardTitle className="font-serif text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          创建者：{creator.name ?? "未知"}
        </p>
        <p className="text-sm text-muted-foreground">
          {questionCount} 题 · {subscriberCount} 人订阅
        </p>
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/bank/${id}`} />}
          nativeButton={false}
        >
          查看详情
        </Button>
      </CardContent>
    </Card>
  );
}
