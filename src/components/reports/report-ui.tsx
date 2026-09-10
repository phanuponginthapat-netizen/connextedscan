import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string | undefined;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "warning";
}) {
  return (
    <Card className="hover-lift group overflow-hidden">
      <CardContent className="flex items-start gap-3 pt-6">
        {Icon && (
          <div
            className={cn(
              "rounded-xl p-2.5 transition-transform duration-300 group-hover:scale-110",
              tone === "warning"
                ? "bg-destructive/10 text-destructive"
                : "bg-secondary text-primary",
            )}
          >
            <Icon className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="animate-soft-in mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  active,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: K;
  active: K;
  dir: "asc" | "desc";
  onSort: (key: K) => void;
  className?: string;
}) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSort(sortKey)}
        className={cn("-ml-2 h-7 gap-1 px-2 font-medium", isActive && "text-foreground")}
      >
        {label}
        <Icon className="size-3.5 opacity-60" />
      </Button>
    </TableHead>
  );
}

export function TablePager({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground print:hidden">
      <span>
        ทั้งหมด {total.toLocaleString("th-TH")} รายการ • หน้า {page} จาก {pageCount}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ก่อนหน้า
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          ถัดไป
        </Button>
      </div>
    </div>
  );
}
