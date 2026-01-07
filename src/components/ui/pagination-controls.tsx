import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  showPageSize?: boolean;
  className?: string;
}

export function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  showPageSize = true,
  className = "",
}: PaginationControlsProps) {
  const startItem = Math.min((page - 1) * pageSize + 1, totalItems);
  const endItem = Math.min(page * pageSize, totalItems);

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 ${className}`}>
      <div className="text-sm text-muted-foreground">
        {totalItems > 0 ? (
          <>
            Afișez {startItem}-{endItem} din {totalItems} înregistrări
          </>
        ) : (
          "Nicio înregistrare"
        )}
      </div>

      <div className="flex items-center gap-2">
        {showPageSize && onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} / pagină
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            className="h-9 w-9"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="h-9 w-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="px-3 text-sm text-muted-foreground">
            Pagina {page} din {totalPages || 1}
          </span>

          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="h-9 w-9"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            className="h-9 w-9"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
