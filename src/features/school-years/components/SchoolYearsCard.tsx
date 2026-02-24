/**
 * School year management: list, activate, archive. For director/secretariat.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Calendar, Archive, CheckCircle } from "lucide-react";
import {
  fetchSchoolYears,
  activateSchoolYear,
  archiveSchoolYear,
  type SchoolYearRow,
} from "../schoolYears.service";
import { useSchool } from "@/hooks/useSchool";
import { toast } from "sonner";

export function SchoolYearsCard() {
  const { schoolId } = useSchool();
  const queryClient = useQueryClient();

  const { data: years, isLoading } = useQuery({
    queryKey: ["school-years", schoolId],
    queryFn: () => fetchSchoolYears(schoolId),
    enabled: !!schoolId,
  });

  const activateMutation = useMutation({
    mutationFn: activateSchoolYear,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-years"] });
      toast.success("Anul școlar a fost activat.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Eroare"),
  });

  const archiveMutation = useMutation({
    mutationFn: archiveSchoolYear,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-years"] });
      toast.success("Anul școlar a fost arhivat.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Eroare"),
  });

  if (!schoolId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Ani școlari
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        ) : !years?.length ? (
          <p className="text-sm text-muted-foreground">Niciun an școlar definit.</p>
        ) : (
          <ul className="space-y-2">
            {(years as SchoolYearRow[]).map((y) => (
              <li
                key={y.id}
                className="flex items-center justify-between gap-2 rounded-lg border p-2"
              >
                <span className="font-medium">{y.label}</span>
                <span className="text-xs text-muted-foreground">
                  {y.start_date} – {y.end_date}
                </span>
                <div className="flex items-center gap-2">
                  {y.is_active ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Activ
                    </Badge>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={activateMutation.isPending}
                        onClick={() => activateMutation.mutate(y.id)}
                      >
                        Activează
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={archiveMutation.isPending}
                        onClick={() => archiveMutation.mutate(y.id)}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
