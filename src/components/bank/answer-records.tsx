"use client";

import { useEffect, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FilterX,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequestState } from "@/components/ui/request-state";
import { MarkdownContent } from "@/components/ui/markdown-content";
import type {
  AnswerRecordsResponse,
  AnswerRecordView,
  AnswerSort,
} from "@/lib/answers/query";

const sortLabels: Record<AnswerSort, string> = {
  "time-desc": "最新作答优先",
  "time-asc": "最早作答优先",
  "incorrect-first": "错误优先",
  "correct-first": "正确优先",
};
const resultLabels = {
  all: "全部结果",
  correct: "只看正确",
  incorrect: "只看错误",
};
const emptyRecords: AnswerRecordView[] = [];
function timeLabel(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value))
    : "未采集";
}
function ResultLabel({ correct }: { correct: boolean }) {
  const Icon = correct ? CheckCircle2 : XCircle;
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${correct ? "text-accent" : "text-destructive"}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {correct ? "正确" : "错误"}
    </span>
  );
}

export function AnswerRecords({ bankId }: { bankId: string }) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<keyof typeof resultLabels>("all");
  const [questionId, setQuestionId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "answeredAt", desc: true },
  ]);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<AnswerRecordsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<AnswerRecordView | null>(null);
  const sort: AnswerSort =
    sorting[0]?.id === "isCorrect"
      ? sorting[0].desc
        ? "correct-first"
        : "incorrect-first"
      : sorting[0]?.desc === false
        ? "time-asc"
        : "time-desc";
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q]);
  const query = useMemo(() => {
    const params = new URLSearchParams({
      q: search,
      result,
      sort,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (questionId !== "all") params.set("questionId", questionId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [search, result, sort, page, pageSize, questionId, from, to]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      fetch(`/api/banks/${bankId}/answers?${query}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "答题记录加载失败");
          return body as AnswerRecordsResponse;
        })
        .then((body) => {
          if (!controller.signal.aborted) setData(body);
        })
        .catch((reason) => {
          if (!controller.signal.aborted)
            setError(
              reason instanceof Error ? reason.message : "答题记录加载失败",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bankId, query, reload]);

  const columns = useMemo<ColumnDef<AnswerRecordView>[]>(
    () => [
      {
        accessorKey: "name",
        header: "姓名",
        size: 136,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span
              className="block truncate font-medium"
              title={row.original.name || undefined}
            >
              {row.original.name ||
                (row.original.identityStatus === "NOT_FOUND"
                  ? "未找到人员"
                  : "待补全")}
            </span>
            {!row.original.name && (
              <span
                className="block truncate text-xs text-muted-foreground"
                title={row.original.accountId}
              >
                {row.original.accountId}
              </span>
            )}
          </div>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "employeeNo",
        header: "工号",
        size: 116,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue<string>() || "—"}</span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "question",
        header: "题目",
        size: 340,
        cell: ({ getValue }) => (
          <span
            className="line-clamp-2 break-words leading-5"
            title={getValue<string>()}
          >
            {getValue<string>()}
          </span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "selectedAnswer",
        header: "所选答案",
        size: 80,
        enableSorting: false,
      },
      {
        accessorKey: "correctAnswer",
        header: "正确答案",
        size: 80,
        enableSorting: false,
      },
      {
        accessorKey: "isCorrect",
        header: "正确情况",
        size: 120,
        sortDescFirst: false,
        cell: ({ row }) => <ResultLabel correct={row.original.isCorrect} />,
      },
      {
        accessorKey: "answeredAt",
        header: "答题时间",
        size: 196,
        sortDescFirst: true,
        cell: ({ getValue }) => (
          <time
            dateTime={getValue<string>()}
            className="whitespace-nowrap tabular-nums text-muted-foreground"
          >
            {timeLabel(getValue<string>())}
          </time>
        ),
      },
      {
        id: "detail",
        header: () => <span className="sr-only">查看详情</span>,
        size: 48,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            title="查看答题详情"
            aria-label={`查看 ${row.original.name || row.original.accountId} 的答题详情`}
            onClick={() => setDetail(row.original)}
          >
            <Eye className="size-4" />
          </Button>
        ),
        enableSorting: false,
      },
    ],
    [],
  );
  const table = useReactTable({
    data: data?.items || emptyRecords,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    rowCount: data?.total || 0,
    state: { sorting, pagination: { pageIndex: page - 1, pageSize } },
    onSortingChange: (update) => {
      setSorting(update);
      setPage(1);
    },
    enableSortingRemoval: false,
    enableMultiSort: false,
  });

  async function exportRecords() {
    setExporting(true);
    try {
      const response = await fetch(
        `/api/banks/${bankId}/answers/export?${query}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "导出失败");
      }
      const blob = await response.blob();
      const filename = response.headers
        .get("Content-Disposition")
        ?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename ? decodeURIComponent(filename) : "答题记录.xlsx";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : "导出失败，请稍后重试",
      );
    } finally {
      setExporting(false);
    }
  }
  function resetFilters() {
    setQ("");
    setSearch("");
    setResult("all");
    setQuestionId("all");
    setFrom("");
    setTo("");
    setPage(1);
    setSorting([{ id: "answeredAt", desc: true }]);
  }
  return (
    <section className="space-y-4" aria-label="答题记录">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-60 min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="搜索答题人姓名、工号或账号"
            placeholder="姓名、工号或账号"
            maxLength={128}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={result}
          onValueChange={(value) => {
            setResult(value as keyof typeof resultLabels);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="筛选正确情况" className="w-32">
            <SelectValue>{resultLabels[result]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(resultLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={questionId}
          onValueChange={(value) => {
            setQuestionId(value || "all");
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="筛选题目" className="w-52">
            <SelectValue>
              {questionId === "all"
                ? "所有题目"
                : data?.questions
                    .find((question) => question.id === questionId)
                    ?.content.slice(0, 18) || "已选题目"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-w-lg">
            <SelectItem value="all">所有题目</SelectItem>
            {data?.questions.map((question, index) => (
              <SelectItem value={question.id} key={question.id}>
                <span className="block max-w-md truncate">
                  {index + 1}. {question.content}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label
              htmlFor={`answers-from-${bankId}`}
              className="text-xs text-muted-foreground"
            >
              开始日期
            </Label>
            <Input
              id={`answers-from-${bankId}`}
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
              className="w-36"
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor={`answers-to-${bankId}`}
              className="text-xs text-muted-foreground"
            >
              结束日期
            </Label>
            <Input
              id={`answers-to-${bankId}`}
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
              className="w-36"
            />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          title="清空筛选"
          aria-label="清空答题筛选"
          onClick={resetFilters}
        >
          <FilterX className="size-4" />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            title="刷新记录"
            aria-label="刷新答题记录"
            disabled={loading}
            onClick={() => setReload((value) => value + 1)}
          >
            <RefreshCw className="size-4" />
          </Button>
          <Button
            size="sm"
            disabled={
              loading ||
              exporting ||
              !!error ||
              !data?.total ||
              search !== q.trim()
            }
            title="导出当前筛选条件下的全部答题记录"
            onClick={() => void exportRecords()}
          >
            {exporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            导出 Excel
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div aria-live="polite">
          {data && !loading && !error ? (
            <>
              共{" "}
              <strong className="font-medium text-foreground">
                {data.total}
              </strong>{" "}
              次答题 · 正确 {data.summary.correct} · 错误{" "}
              {data.summary.incorrect}
              {data.summary.missingIdentities > 0 && (
                <span className="ml-3">
                  {data.summary.missingIdentities} 条人员资料待补全
                </span>
              )}
            </>
          ) : error ? (
            "记录暂不可用"
          ) : (
            "正在读取记录"
          )}
        </div>
        <Select
          value={sort}
          onValueChange={(value) => {
            const selected = value as AnswerSort;
            setSorting([
              {
                id: selected.includes("first") ? "isCorrect" : "answeredAt",
                desc: selected === "correct-first" || selected === "time-desc",
              },
            ]);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="答题记录排序" size="sm" className="w-40">
            <SelectValue>{sortLabels[sort]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(sortLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {data?.identitySync.unavailable && (
        <p role="status" className="text-xs text-muted-foreground">
          人员目录暂不可用，答题记录已保存，姓名和工号稍后自动补全。
        </p>
      )}
      {error ? (
        <RequestState
          title={error}
          onRetry={() => setReload((value) => value + 1)}
        />
      ) : (
        <div
          className="min-h-80 max-h-[min(640px,60vh)] overflow-auto border-y"
          aria-busy={loading}
          tabIndex={0}
          aria-label="答题记录表格"
        >
          <table className="w-full min-w-[1040px] table-fixed text-sm">
            <colgroup>
              {table.getAllLeafColumns().map((column) => (
                <col
                  key={column.id}
                  style={{
                    width: `${(column.getSize() / table.getTotalSize()) * 100}%`,
                  }}
                />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-3 py-3 text-left font-medium"
                      aria-sort={
                        header.column.getIsSorted() === "asc"
                          ? "ascending"
                          : header.column.getIsSorted() === "desc"
                            ? "descending"
                            : undefined
                      }
                    >
                      {header.column.getCanSort() ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-2 h-7 px-2 text-xs"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getIsSorted() === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : header.column.getIsSorted() === "desc" ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ArrowUpDown className="size-3" />
                          )}
                        </Button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }, (_, index) => (
                  <tr key={index} aria-hidden className="border-t">
                    {columns.map((_, cell) => (
                      <td className="px-3 py-4" key={cell}>
                        <div className="h-4 animate-pulse rounded-sm bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !data?.items.length ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="py-12 text-center text-muted-foreground"
                  >
                    {search ||
                    result !== "all" ||
                    from ||
                    to ||
                    questionId !== "all"
                      ? "没有符合筛选条件的答题记录"
                      : "还没有答题记录"}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.original.id}
                    className="border-t hover:bg-muted/40"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-3 align-middle">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {data && !error && (
        <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>北京时间</span>
          <div className="flex items-center gap-3">
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="每页答题记录条数" size="sm">
                <SelectValue>每页 {pageSize} 条</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100].map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    每页 {value} 条
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="min-w-12 text-center tabular-nums">
              {data.page} / {data.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              title="上一页"
              aria-label="上一页答题记录"
              disabled={loading || data.page <= 1}
              onClick={() => setPage(data.page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              title="下一页"
              aria-label="下一页答题记录"
              disabled={loading || data.page >= data.totalPages}
              onClick={() => setPage(data.page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>答题详情</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{detail.name || "姓名待补全"}</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    工号 {detail.employeeNo || "待补全"} · 账号{" "}
                    {detail.accountId}
                  </p>
                </div>
                <ResultLabel correct={detail.isCorrect} />
              </div>
              <MarkdownContent>{detail.question}</MarkdownContent>
              <div className="flex flex-wrap gap-3">
                <Badge variant="secondary">
                  所选答案 {detail.selectedAnswer}
                </Badge>
                <Badge variant="outline">正确答案 {detail.correctAnswer}</Badge>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 border-t pt-4 text-xs">
                <dt className="text-muted-foreground">答题时间</dt>
                <dd>{timeLabel(detail.answeredAt)}（北京时间）</dd>
                <dt className="text-muted-foreground">资料采集时间</dt>
                <dd>{timeLabel(detail.identityCapturedAt)}</dd>
                <dt className="text-muted-foreground">人员资料来源</dt>
                <dd>
                  {detail.identityStatus !== "RESOLVED"
                    ? "尚未补全"
                    : detail.identityBackfilled
                      ? "历史记录后补资料"
                      : "记录后首次采集快照"}
                </dd>
                {!detail.questionSnapshotAvailable && (
                  <>
                    <dt className="text-muted-foreground">题目来源</dt>
                    <dd>旧记录未保存题目快照，显示当前题目内容。</dd>
                  </>
                )}
              </dl>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
