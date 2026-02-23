import { useState, useEffect } from "react";
import { FileDown, GraduationCap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/spinner";
import { exportClassRegisterPdf, exportClassRegisterCsv } from "@/utils/exportClassRegisterPdf";
import {
  getCurrentAcademicYear,
  getCurrentSemester,
} from "@/features/academics/services/semester.service";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";

interface ClassRow {
  id: string;
  name: string;
  year: number | null;
  section: string | null;
}

interface ExportClassRegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportClassRegisterDialog({
  open,
  onOpenChange,
}: ExportClassRegisterDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [academicYear, setAcademicYear] = useState<number>(getCurrentAcademicYear());
  const [semester, setSemester] = useState<1 | 2>(getCurrentSemester());

  // Fetch classes when dialog opens
  useEffect(() => {
    if (open) {
      const fetchClasses = async () => {
        const schoolId = await getCurrentUserSchoolId();
        if (!schoolId) return;

        const { data, error } = await supabase
          .from("classes")
          .select("id, name, year, section")
          .eq("school_id", schoolId)
          .order("year", { ascending: true })
          .order("section", { ascending: true });

        if (error) {
          console.error("Error fetching classes:", error);
          return;
        }

        setClasses(data || []);
        if (data && data.length > 0 && !selectedClassId) {
          setSelectedClassId(data[0].id);
        }
      };

      void fetchClasses();
    }
  }, [open, selectedClassId]);

  const handleExport = async () => {
    if (!selectedClassId) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să selectați o clasă.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await exportClassRegisterPdf(selectedClassId, academicYear, semester);

      toast({
        title: "PDF generat cu succes",
        description: "Foaia Matricolă a fost exportată în PDF.",
      });
      onOpenChange(false);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Eroare la generarea PDF-ului";
      toast({
        title: "Eroare",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    if (!selectedClassId) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să selectați o clasă.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      await exportClassRegisterCsv(selectedClassId, academicYear, semester);
      toast({
        title: "CSV exportat cu succes",
        description: "Catalogul a fost exportat în CSV.",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Eroare la exportul CSV";
      toast({
        title: "Eroare",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Generate academic year options (current year and previous 2 years)
  const currentYear = getCurrentAcademicYear();
  const academicYearOptions = Array.from({ length: 3 }, (_, i) => currentYear - i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Export Foaia Matricolă PDF
          </DialogTitle>
          <DialogDescription>
            Generează Foaia Matricolă în format PDF cu notele finale ale elevilor pentru clasa
            selectată.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="class-select">Clasă</Label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger id="class-select">
                <SelectValue placeholder="Selectați clasa" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.year && cls.section
                      ? `${cls.name} (${cls.year}${cls.section})`
                      : cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="academic-year">An Academic</Label>
            <Select
              value={academicYear.toString()}
              onValueChange={(value) => setAcademicYear(parseInt(value, 10))}
            >
              <SelectTrigger id="academic-year">
                <SelectValue placeholder="Selectați anul academic" />
              </SelectTrigger>
              <SelectContent>
                {academicYearOptions.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year} - {year + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="semester">Semestru</Label>
            <Select
              value={semester.toString()}
              onValueChange={(value) => setSemester(parseInt(value, 10) as 1 | 2)}
            >
              <SelectTrigger id="semester">
                <SelectValue placeholder="Selectați semestrul" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Semestrul I (Septembrie - Ianuarie)</SelectItem>
                <SelectItem value="2">Semestrul II (Februarie - Iunie)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <GraduationCap className="h-4 w-4" />
              Informații
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Documentul va include numele școlii și logoul</li>
              <li>Tabel cu elevi pe rânduri și materii pe coloane</li>
              <li>Notele finale vor fi preluate din final_grades</li>
              <li>Data generării va fi inclusă în document</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Anulează
          </Button>
          <Button variant="outline" onClick={handleExportCsv} disabled={loading || !selectedClassId}>
            Exportă CSV
          </Button>
          <Button onClick={handleExport} disabled={loading || !selectedClassId}>
            {loading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Se generează...
              </>
            ) : (
              <>
                <FileDown className="mr-2 h-4 w-4" />
                Generează PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
