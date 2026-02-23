/**
 * Search bar global: elevi (nume), clase. Afișează rezultate în dropdown.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, User, GraduationCap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { globalSearch, type GlobalSearchResult } from "../globalSearch.service";
import { useSchool } from "@/hooks/useSchool";
import { cn } from "@/lib/utils";

export function GlobalSearchBar({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const { schoolId } = useSchool();
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(0);

  useEffect(() => {
    debounceRef.current = setTimeout(() => setQuery(inputValue), 200);
    return () => clearTimeout(debounceRef.current);
  }, [inputValue]);

  const searchQuery = useQuery({
    queryKey: ["global-search", query, schoolId],
    queryFn: () => globalSearch(query, schoolId),
    enabled: query.length >= 2 && !!schoolId,
    staleTime: 30_000,
  });

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setOpen(true);
  }, []);

  const results: GlobalSearchResult = searchQuery.data ?? { students: [], classes: [] };
  const hasResults = results.students.length > 0 || results.classes.length > 0;
  const showDropdown = open && (query.length >= 2);

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          value={inputValue}
          placeholder="Caută elevi, clase..."
          className="pl-9 w-full max-w-[220px]"
          onChange={handleChange}
          onFocus={() => inputValue.length >= 2 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border bg-popover shadow-md max-h-[320px] overflow-auto">
          {searchQuery.isLoading && (
            <div className="p-3 text-sm text-muted-foreground">Se caută...</div>
          )}
          {!searchQuery.isLoading && !hasResults && (
            <div className="p-3 text-sm text-muted-foreground">Niciun rezultat.</div>
          )}
          {!searchQuery.isLoading && hasResults && (
            <>
              {results.students.length > 0 && (
                <div className="p-2 border-b">
                  <p className="text-xs font-medium text-muted-foreground px-2 mb-1">Elevi</p>
                  {results.students.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="flex items-center gap-2 w-full px-2 py-2 rounded hover:bg-accent text-left text-sm"
                      onMouseDown={() => {
                        navigate(`/reports?student=${s.id}`);
                        setOpen(false);
                      }}
                    >
                      <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{s.full_name ?? "—"}</span>
                      {s.class_name && (
                        <span className="text-muted-foreground text-xs">({s.class_name})</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {results.classes.length > 0 && (
                <div className="p-2">
                  <p className="text-xs font-medium text-muted-foreground px-2 mb-1">Clase</p>
                  {results.classes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="flex items-center gap-2 w-full px-2 py-2 rounded hover:bg-accent text-left text-sm"
                      onMouseDown={() => {
                        navigate(`/reports?class=${c.id}`);
                        setOpen(false);
                      }}
                    >
                      <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
