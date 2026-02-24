/**
 * Import clase din CSV: upload, mapare coloană (ColumnMappingStep), validare, previzualizare, confirmare.
 */
import { useState, useCallback, useMemo, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { parseCSV } from "@/lib/bulk-import-validation";
import { parseExcelFromArrayBuffer } from "@/lib/parseExcel";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import {
  validateClassesImport,
  importClasses,
  type ClassesImportValidationResult,
  type ClassImportRow,
} from "../services/classes-import.service";
import { ColumnMappingStep, getMappingErrors } from "./ColumnMappingStep";
import { toast } from "sonner";

const CSV_TEMPLATE_CLASSES = "name\n10A\n10B\n11A\n11B";

const CLASS_FIELDS = [{ key: "name", label: "Nume clasă" }];

function getHeaders(rows: Record<string, string>[]): string[] {
  return rows.length === 0 ? [] : Object.keys(rows[0]);
}

function extractNamesFromColumn(rows: Record<string, string>[], columnKey: string): string[] {
  return rows.map((r: Record<string, string>) => (r[columnKey] ?? "").trim()).filter(Boolean);
}

export function ImportClasses({ isActive = true }: { isActive?: boolean }) {
  const queryClient = useQueryClient();
  const [validation, setValidation] = useState<ClassesImportValidationResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  /** After upload: parsed rows; user picks column then we validate */
  const [parsedRows, setParsedRows] = useState<Record<string, string>[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const csvHeaders = useMemo(() => getHeaders(parsedRows ?? []), [parsedRows]);
  const mappingErrors = useMemo(() => getMappingErrors(CLASS_FIELDS, mapping), [mapping]);

  const validateMutation = useMutation({
    mutationFn: async (payload: { names: string[] }) => {
      const schoolId = await getCurrentUserSchoolId();
      if (!schoolId) throw new Error("Nu aveți o școală asociată");
      return validateClassesImport(payload.names, schoolId);
    },
    onSuccess: (data: ClassesImportValidationResult) => {
      setValidation(data);
      setFileError(null);
      toast.info(
        data.validNames.length ? `${data.validNames.length} clase valide` : "Nicio clasă validă. Verificați erorile."
      );
    },
    onError: (e: Error) => {
      setFileError(e.message);
      toast.error("Eroare validare", { description: e.message });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const schoolId = await getCurrentUserSchoolId();
      if (!schoolId || !validation?.validNames.length) throw new Error("Nu există clase de importat");
      return importClasses(schoolId, validation.validNames);
    },
    onSuccess: (data: { created: number }) => {
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      setValidation(null);
      setParsedRows(null);
      setMapping({});
      toast.success(`${data.created} clase create.`);
    },
    onError: (e: Error) => {
      toast.error("Eroare import", { description: e.message });
    },
  });

  const runValidation = useCallback(() => {
    if (!parsedRows?.length || mappingErrors.length > 0 || !mapping.name) return;
    const names = extractNamesFromColumn(parsedRows, mapping.name);
    validateMutation.mutate({ names });
  }, [parsedRows, mapping, mappingErrors.length, validateMutation]);

  const handleFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setValidation(null);
      setFileError(null);
      const isExcel = file.name.toLowerCase().endsWith(".xlsx");
      if (isExcel) {
        const reader = new FileReader();
        reader.onload = async () => {
          const buffer = reader.result as ArrayBuffer;
          const { rows, error } = await parseExcelFromArrayBuffer(buffer);
          if (error) {
            setFileError(error);
            return;
          }
          const r = rows ?? [];
          setParsedRows(r);
          setMapping(getHeaders(r)[0] ? { name: getHeaders(r)[0] } : {});
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result ?? "");
          const r = parseCSV(text);
          setParsedRows(r);
          setMapping(getHeaders(r)[0] ? { name: getHeaders(r)[0] } : {});
        };
        reader.readAsText(file, "UTF-8");
      }
      e.target.value = "";
    },
    []
  );

  if (!isActive) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-medium mb-2">Import clase (CSV / Excel)</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Încărcați un fișier cu o coloană de nume de clase. Duplicatele și clasele care există deja sunt semnalate.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => {
            const blob = new Blob([CSV_TEMPLATE_CLASSES], { type: "text/csv;charset=utf-8;" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "template_clase.csv";
            a.click();
            URL.revokeObjectURL(a.href);
          }}>
            <Download className="w-4 h-4 mr-2" />
            Descarcă template
          </Button>
          <Label className="cursor-pointer">
            <span className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2">
              <Upload className="w-4 h-4 mr-2" />
              Încarcă CSV / Excel
            </span>
            <input
              type="file"
              accept=".csv,.xlsx"
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

        {parsedRows && parsedRows.length > 0 && (
          <div className="mt-4 space-y-4">
            <ColumnMappingStep
              csvHeaders={csvHeaders}
              requiredFields={CLASS_FIELDS}
              mapping={mapping}
              onMappingChange={(key, value) => setMapping((prev: Record<string, string>) => ({ ...prev, [key]: value }))}
              previewRows={parsedRows.slice(0, 5)}
              errors={mappingErrors}
            />
            <Button
              type="button"
              onClick={runValidation}
              disabled={validateMutation.isPending || mappingErrors.length > 0 || !mapping.name}
            >
              {validateMutation.isPending ? "Se validează…" : "Validare și previzualizare"}
            </Button>
          </div>
        )}
      </div>

      {validation && (
        <>
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">#</th>
                    <th className="text-left p-2 font-medium">Nume clasă</th>
                    <th className="text-left p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.rows.map((r: ClassImportRow) => (
                    <tr key={r.rowIndex} className="border-t">
                      <td className="p-2">{r.rowIndex + 1}</td>
                      <td className="p-2">{r.name}</td>
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
              disabled={validation.validNames.length === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate()}
            >
              {importMutation.isPending ? "Se importă…" : `Importă ${validation.validNames.length} clase`}
            </Button>
            <span className="text-sm text-muted-foreground">
              {validation.validNames.length} valide, {validation.rows.filter((r: ClassImportRow) => r.errors.length > 0).length} cu erori
            </span>
          </div>
        </>
      )}
    </div>
  );
}
