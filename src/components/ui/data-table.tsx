import { useState, useMemo, ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Extract a sortable/filterable value */
  accessor?: (row: T) => string | number;
  /** Custom cell renderer */
  render?: (row: T, index: number) => ReactNode;
  /** Whether this column is sortable (default true) */
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  /** Unique key extractor */
  rowKey: (row: T, index: number) => string;
  /** Enable search across accessor values */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Page size (0 = no pagination) */
  pageSize?: number;
  /** Loading state */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Zebra striping */
  striped?: boolean;
  /** Extra class on wrapper */
  className?: string;
  /** Row click handler */
  onRowClick?: (row: T) => void;
  /** Server-side pagination */
  serverSidePagination?: {
    total: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
  };
}

type SortDir = "asc" | "desc" | null;

export function DataTable<T>({
  data,
  columns,
  rowKey,
  searchable = false,
  searchPlaceholder = "Caută...",
  pageSize = 0,
  loading = false,
  emptyMessage = "Nu există date.",
  striped = true,
  className,
  onRowClick,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        if (!col.accessor) return false;
        return String(col.accessor(row)).toLowerCase().includes(q);
      })
    );
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.accessor) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col.accessor!(a);
      const vb = col.accessor!(b);
      if (typeof va === "number" && typeof vb === "number")
        return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "ro") * dir;
    });
  }, [filtered, sortKey, sortDir, columns]);

  // Use server-side pagination if provided, otherwise client-side
  const totalPages = serverSidePagination
    ? Math.max(1, Math.ceil(serverSidePagination.total / serverSidePagination.pageSize))
    : pageSize > 0
    ? Math.max(1, Math.ceil(sorted.length / pageSize))
    : 1;
  
  const paginated = serverSidePagination
    ? data // Server-side: data is already paginated
    : pageSize > 0
    ? sorted.slice(page * pageSize, (page + 1) * pageSize)
    : sorted;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        setSortKey(null);
        setSortDir(null);
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    const newPage = 0;
    setPage(newPage);
    if (serverSidePagination) {
      serverSidePagination.onPageChange(newPage);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    if (serverSidePagination) {
      serverSidePagination.onPageChange(newPage);
    }
  };

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-card rounded-2xl border border-border overflow-hidden",
        className
      )}
    >
      {searchable && (
        <div className="p-4 border-b border-border">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              {columns.map((col) => {
                const isSortable = col.sortable !== false && !!col.accessor;
                return (
                  <TableHead
                    key={col.key}
                    className={cn(
                      isSortable && "cursor-pointer select-none",
                      col.className
                    )}
                    onClick={isSortable ? () => handleSort(col.key) : undefined}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {isSortable && (
                        <span className="text-muted-foreground">
                          {sortKey === col.key && sortDir === "asc" && (
                            <ChevronUp className="w-4 h-4" />
                          )}
                          {sortKey === col.key && sortDir === "desc" && (
                            <ChevronDown className="w-4 h-4" />
                          )}
                          {(sortKey !== col.key || !sortDir) && (
                            <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />
                          )}
                        </span>
                      )}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-12"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((row, idx) => (
                <TableRow
                  key={rowKey(row, idx)}
                  className={cn(
                    "transition-colors",
                    striped && idx % 2 === 1 && "bg-muted/30",
                    onRowClick && "cursor-pointer hover:bg-secondary/50"
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render
                        ? col.render(row, page * pageSize + idx)
                        : col.accessor
                        ? String(col.accessor(row))
                        : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {(pageSize > 0 || serverSidePagination) && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-sm text-muted-foreground">
            {serverSidePagination
              ? `${serverSidePagination.total} rezultate`
              : `${sorted.length} rezultate`}{" "}
            • Pagina {page + 1} din {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => handlePageChange(page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => handlePageChange(page + 1)}
            >
              Următor
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
