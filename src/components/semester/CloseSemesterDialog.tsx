import { useState } from "react";
import { Lock, GraduationCap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  closeSemesterGrading,
  getCurrentAcademicYear,
  getCurrentSemester,
} from "@/features/academics/services/semester.service";

interface CloseSemesterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CloseSemesterDialog({
  open,
  onOpenChange,
  onSuccess,
}: CloseSemesterDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [academicYear, setAcademicYear] = useState<number>(getCurrentAcademicYear());
  const [semester, setSemester] = useState<1 | 2>(getCurrentSemester());

  const requestClose = () => setConfirmOpen(true);

  const handleClose = async () => {
    if (!academicYear || !semester) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să selectați anul academic și semestrul.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const result = await closeSemesterGrading(academicYear, semester);

      if (result.success) {
        toast({
          title: "Semestru închis cu succes",
          description: result.message,
        });
        onSuccess?.();
        setConfirmOpen(false);
        onOpenChange(false);
      } else {
        toast({
          title: "Eroare",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Eroare la închiderea semestrului";
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
            <Lock className="h-5 w-5" />
            Închidere Semestru
          </DialogTitle>
          <DialogDescription>
            Calculați și salvați notele finale pentru un semestru. Odată închis, semestrul nu mai
            poate fi modificat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
              <li>Se vor calcula notele finale pentru toți elevii din școală</li>
              <li>Media va fi rotunjită la cel mai apropiat întreg</li>
              <li>După închidere, notele din acel semestru nu vor mai putea fi modificate</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Anulează
          </Button>
          <Button onClick={requestClose} disabled={loading}>
            {loading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Se procesează...
              </>
            ) : (
              <>
                <Lock className="mr-2 h-4 w-4" />
                Închide Semestrul
              </>
            )}
          </Button>
        </DialogFooter>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmare închidere semestru</AlertDialogTitle>
              <AlertDialogDescription>
                Sigur doriți să închideți semestrul {semester} din anul școlar {academicYear}-{academicYear + 1}? 
                După închidere, notele nu vor mai putea fi modificate.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anulare</AlertDialogCancel>
              <AlertDialogAction onClick={handleClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Închide semestrul
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
