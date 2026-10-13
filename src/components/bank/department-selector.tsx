"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SelectedDepartment = {
  id: string;
  name: string;
};

type DepartmentSearchItem = {
  department: SelectedDepartment;
  path: SelectedDepartment[];
};

interface DepartmentSelectorProps {
  value: SelectedDepartment[];
  onChange: (value: SelectedDepartment[]) => void;
  disabled?: boolean;
}

function departmentPathLabel(item: DepartmentSearchItem): string {
  const names = item.path.map((node) => node.name).filter(Boolean);
  return names.length ? names.join(" / ") : item.department.name;
}

export function DepartmentSelector({
  value,
  onChange,
  disabled = false,
}: DepartmentSelectorProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DepartmentSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestIdRef = useRef(0);

  const selectedIds = useMemo(
    () => new Set(value.map((item) => item.id)),
    [value],
  );

  useEffect(() => {
    const q = query.trim();
    const requestId = ++requestIdRef.current;

    const timer = setTimeout(() => {
      setFailed(false);
      if (!q) {
        setItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      fetch(`/api/directory/departments/search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({ items: [] }));
          if (!res.ok) throw new Error(data.error ?? "search failed");
          return data;
        })
        .then((data: { items?: DepartmentSearchItem[] }) => {
          if (requestId !== requestIdRef.current) return;
          setItems(Array.isArray(data.items) ? data.items : []);
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          setItems([]);
          setFailed(true);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false);
        });
    }, q ? 250 : 0);

    return () => clearTimeout(timer);
  }, [query]);

  const add = (item: DepartmentSearchItem) => {
    const department = item.department;
    if (!department.id || selectedIds.has(department.id)) return;
    onChange([...value, { id: department.id, name: department.name || department.id }]);
    setQuery("");
    setItems([]);
  };

  const remove = (id: string) => {
    onChange(value.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="搜索可见部门"
          maxLength={128}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索部门名称，如 技术、产品"
          disabled={disabled}
          className="h-10 pl-9"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {query.trim() ? (
        <div className="max-h-56 overflow-auto rounded-md border border-border bg-card shadow-sm">
          {failed ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              部门服务暂不可用，请稍后重试。
            </div>
          ) : loading && items.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">搜索中...</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              没有找到匹配部门
            </div>
          ) : (
            items.map((item) => {
              const selected = selectedIds.has(item.department.id);
              return (
                <button
                  key={item.department.id}
                  type="button"
                  onClick={() => add(item)}
                  disabled={selected || disabled}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left last:border-0",
                    selected
                      ? "cursor-not-allowed bg-muted/60 text-muted-foreground"
                      : "hover:bg-muted/70",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {item.department.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {departmentPathLabel(item)}，{item.department.id}
                    </span>
                  </span>
                  {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((department) => (
            <Badge
              key={department.id}
              variant="secondary"
              className="h-7 max-w-full gap-1 rounded-md px-2 font-normal"
            >
              <span className="truncate">{department.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {department.id}
              </span>
              <button
                type="button"
                className="ml-0.5 inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => remove(department.id)}
                disabled={disabled}
                aria-label={`移除 ${department.name}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
