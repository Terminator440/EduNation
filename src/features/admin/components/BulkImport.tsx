import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  parseCSV,
  mapCSVRowToBulkImportRow,
  validateBulkImportRow,
  type BulkImportRole,
  type BulkImportRowValidation,
} from "@/lib/bulk-import-validation";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import {
  validateBulkImportRows,
  callBulkImportEdge,
  type BulkImportValidationResult,
} from "../services/bulk-import.service";
import { toast } from "sonner";

const CSV_TEMPLATE_STUDENTS = "email,full_name,cnp,phone,class\nion.popescu@email.ro,Ion Popescu,1900101123456,,10A";
const CSV_TEMPLATE_TEACHERS = "email,full_name,cnp,phone\nmaria.ionescu@email.ro,Maria Ionescu,2850302123456,";

export function BulkImport({ isActive = true }: { isActive?: boolean }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<BulkImportRole>("student");
  const [validations, setValidations] = useState<BulkImportValidationResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const validateMutation = useMutation({
    mutationFn: async (csvText: string) => {
      const schoolId = await getCurrentUserSchoolId();
      if (!schoolId) throw new Error("Nu aveți o școală asociată");
      const rows = parseCSV(csvText);
      if (rows.length === 0) throw new Error("Fișierul CSV este gol sau format invalid");
      const clientValidations: BulkImportRowValidation[] = rows.map((raw, i) => {
        const row = mapCSVRowToBulkImportRow(raw, role);
        return validateBulkImportRow(row, i, role);
      });
      return validateBulkImportRows(clientValidations, schoolId);
    },
    onSuccess: (data) => {
      setValidations(data);
      setFileError(null);
      const valid = data.validRows.length;
      const invalid = data.rows.filter((r) => r.errors.length > 0).length;
      if (invalid > 0) {
        toast.info("Validare completă", {
          description: `${valid} rânduri valide, ${invalid} cu erori. Verificați tabelul.`,
        });
      }
    },
    onError: (err: Error) => {
      setFileError(err.message);
      toast.error("Eroare validare", { description: err.message });
    },
  });

  const importMutation = useMutation({
    mutationFn: callBulkImportEdge,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setValidations(null);
      toast.success("Import finalizat", {
        description: `${data.created} utilizatori creați din ${data.total}.`,
      });
      if (data.results.some((r) => !r.success)) {
        const failed = data.results.filter((r) => !r.success);
        toast.warning(`${failed.length} rânduri au eșuat`, {
          description: failed.map((r) => `Rând ${r.rowIndex + 1}: ${r.error}`).join("; "),
        });
      }
    },
    onError: (err: Error) => {
      toast.error("Eroare import", { description: err.message });
    },
  });

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setValidations(null);
      setFileError(null);
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        validateMutation.mutate(text);
      };
      reader.onerror = () => setFileError("Nu s-a putut citi fișierul");
      reader.readAsText(file, "UTF-8");
      e.target.value = "";
    },
    [role, validateMutation]
  );

  const downloadTemplate = useCallback(() => {
    const csv = role === "student" ? CSV_TEMPLATE_STUDENTS : CSV_TEMPLATE_TEACHERS;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = role === "student" ? "template_elevi.csv" : "template_profesori.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [role]);

  if (!isActive) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-medium mb-2">Import în masă (elevi sau profesori)</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Încărcați un fișier CSV cu coloane: email, full_name, cnp (opțional), phone (opțional) și pentru elevi: class (ex. 10A).
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <RadioGroup
            value={role}
            onValueChange={(v) => {
              setRole(v as BulkImportRole);
              setValidations(null);
              setFileError(null);
            }}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="student" id="role-student" />
              <Label htmlFor="role-student">Elevi</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="teacher" id="role-teacher" />
              <Label htmlFor="role-teacher">Profesori</Label>
            </div>
          </RadioGroup>
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-2" />
            Descarcă template CSV
          </Button>
          <Label className="cursor-pointer">
            <span className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2">
              <Upload className="w-4 h-4 mr-2" />
              Încarcă CSV
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={handleFile}
              disabled={validateMutation.isPending}
            />
          </Label>
        </div>
        {fileError && (
          <p className="text-sm text-destructive mt-2 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            {fileError}
          </p>
        )}
      </div>

      {validations && (
        <>
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">#</th>
                    <th className="text-left p-2 font-medium">Email</th>
                    <th className="text-left p-2 font-medium">Nume</th>
                    {role === "student" && <th className="text-left p-2 font-medium">Clasă</th>}
                    <th className="text-left p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validations.rows.map((r) => (
                    <tr key={r.rowIndex} className="border-t">
                      <td className="p-2">{r.rowIndex + 1}</td>
                      <td className="p-2">{r.email}</td>
                      <td className="p-2">{r.full_name}</td>
                      {role === "student" && <td className="p-2">{r.class_identifier ?? "—"}</td>}
                      <td className="p-2">
                        {r.errors.length > 0 ? (
                          <span className="text-destructive flex items-center gap-1">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {r.errors.join("; ")}
                          </span>
                        ) : (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            Valid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              disabled={validations.validRows.length === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate(validations.validRows)}
            >
              {importMutation.isPending ? "Se importă…" : `Importă ${validations.validRows.length} utilizatori`}
            </Button>
            <span className="text-sm text-muted-foreground">
              {validations.validRows.length} rânduri valide,{" "}
              {validations.rows.filter((r) => r.errors.length > 0).length} cu erori
            </span>
          </div>
        </>
      )}
    </div>
  );
}
