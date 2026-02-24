import { useState, useCallback, useMemo, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  parseCSV,
  mapCSVRowWithMappingToBulkImportRow,
  validateBulkImportRow,
  BULK_IMPORT_CSV_HEADERS,
  type BulkImportRole,
  type BulkImportRowValidation,
} from "@/lib/bulk-import-validation";
import { parseExcelFromArrayBuffer } from "@/lib/parseExcel";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import {
  validateBulkImportRows,
  callBulkImportEdge,
  type BulkImportValidationResult,
  type BulkImportEdgeResult,
} from "../services/bulk-import.service";
import { ColumnMappingStep, getMappingErrors, type RequiredField } from "./ColumnMappingStep";
import { toast } from "sonner";
import { toFriendlySupabaseError } from "@/utils/supabaseErrors";

const CSV_TEMPLATE_STUDENTS = "email,full_name,cnp,phone,class\nion.popescu@email.ro,Ion Popescu,1900101123456,,10A";
/** Template pentru import elevi: name, class, email (coloanele pot fi și full_name, class_identifier) */
export const CSV_TEMPLATE_STUDENTS_SIMPLE = "name,class,email\nIon Popescu,10A,ion.popescu@email.ro\nMaria Ionescu,10A,";
const CSV_TEMPLATE_TEACHERS = "email,full_name,cnp,phone\nmaria.ionescu@email.ro,Maria Ionescu,2850302123456,";

const STUDENT_FIELDS: RequiredField[] = [
  { key: "name", label: "Nume" },
  { key: "email", label: "Email" },
  { key: "class", label: "Clasă" },
];
const TEACHER_FIELDS: RequiredField[] = [
  { key: "name", label: "Nume" },
  { key: "email", label: "Email" },
];

function getHeaders(rows: Record<string, string>[]): string[] {
  return rows.length > 0 ? Object.keys(rows[0]) : [];
}

/** Default mapping: first header that matches known aliases (case-insensitive). */
function defaultMapping(headers: string[], role: BulkImportRole): Record<string, string> {
  const lower = (s: string) => s.trim().toLowerCase();
  const map: Record<string, string> = {};
  const pick = (field: keyof typeof BULK_IMPORT_CSV_HEADERS) => {
    const aliases = BULK_IMPORT_CSV_HEADERS[field].map(lower);
    const h = headers.find((x) => aliases.includes(lower(x)));
    if (h) map[field === "full_name" ? "name" : field === "class_identifier" ? "class" : field] = h;
  };
  pick("email");
  pick("full_name");
  if (role === "student") pick("class_identifier");
  pick("cnp");
  pick("phone");
  return map;
}

export function BulkImport({ isActive = true }: { isActive?: boolean }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<BulkImportRole>("student");
  const [validations, setValidations] = useState<BulkImportValidationResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const requiredFields = role === "student" ? STUDENT_FIELDS : TEACHER_FIELDS;
  const csvHeaders = useMemo(() => getHeaders(parsedRows ?? []), [parsedRows]);
  const mappingErrors = useMemo(() => getMappingErrors(requiredFields, mapping), [requiredFields, mapping]);

  const validateMutation = useMutation({
    mutationFn: async (payload: { rows: Record<string, string>[]; mapping: Record<string, string> }) => {
      const schoolId = await getCurrentUserSchoolId();
      if (!schoolId) throw new Error("Nu aveți o școală asociată");
      const { rows, mapping: map } = payload;
      if (rows.length === 0) throw new Error("Fișierul este gol sau format invalid");
      const clientValidations: BulkImportRowValidation[] = rows.map((raw, i) => {
        const row = mapCSVRowWithMappingToBulkImportRow(raw, map, role);
        return validateBulkImportRow(row, i, role);
      });
      return validateBulkImportRows(clientValidations, schoolId);
    },
    onSuccess: (data: BulkImportValidationResult) => {
      setValidations(data);
      setFileError(null);
      const valid = data.validRows.length;
      const invalid = data.rows.filter((r: BulkImportValidationResult["rows"][number]) => r.errors.length > 0).length;
      if (invalid > 0) {
        toast.info("Validare completă", {
          description: `${valid} rânduri valide, ${invalid} cu erori. Verificați tabelul.`,
        });
      }
    },
    onError: (err: Error) => {
      const msg = toFriendlySupabaseError(err, { entity: "import" });
      setFileError(msg);
      toast.error("Eroare validare", { description: msg });
    },
  });

  const importMutation = useMutation({
    mutationFn: callBulkImportEdge,
    onSuccess: (data: BulkImportEdgeResult) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setValidations(null);
      setParsedRows(null);
      setMapping({});
      toast.success("Import finalizat", {
        description: `${data.created} utilizatori creați din ${data.total}.`,
      });
      type ResultRow = BulkImportEdgeResult["results"][number];
      if (data.results.some((r: ResultRow) => !r.success)) {
        const failed = data.results.filter((r: ResultRow) => !r.success);
        toast.warning(`${failed.length} rânduri au eșuat`, {
          description: failed.map((r: ResultRow) => `Rând ${r.rowIndex + 1}: ${r.error}`).join("; "),
        });
      }
    },
    onError: (err: Error) => {
      toast.error("Eroare import", { description: toFriendlySupabaseError(err, { entity: "import" }) });
    },
  });

  const handleFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setValidations(null);
      setFileError(null);
      const isExcel = file.name.toLowerCase().endsWith(".xlsx");
      if (isExcel) {
        const reader = new FileReader();
        reader.onload = async () => {
          const buffer = reader.result as ArrayBuffer;
          const { rows, error } = await parseExcelFromArrayBuffer(buffer);
          if (error) {
            setFileError(error);
            toast.error("Eroare Excel", { description: error });
            return;
          }
          const r = rows ?? [];
          setParsedRows(r);
          setMapping(defaultMapping(getHeaders(r), role));
        };
        reader.onerror = () => setFileError("Nu s-a putut citi fișierul");
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result ?? "");
          const r = parseCSV(text);
          setParsedRows(r);
          setMapping(defaultMapping(getHeaders(r), role));
        };
        reader.onerror = () => setFileError("Nu s-a putut citi fișierul");
        reader.readAsText(file, "UTF-8");
      }
      e.target.value = "";
    },
    [role]
  );

  const runValidation = useCallback(() => {
    if (mappingErrors.length > 0 || !parsedRows?.length) return;
    validateMutation.mutate({ rows: parsedRows, mapping });
  }, [parsedRows, mapping, mappingErrors.length, validateMutation]);

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
          {role === "student"
            ? "Import elevi: coloane name (sau full_name), class (ex. 10A), email (obligatoriu pentru cont). Validări: existența clasei, evită duplicate după email."
            : "Import profesori: coloane email, full_name, cnp (opțional), phone (opțional)."}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <RadioGroup
            value={role}
            onValueChange={(v: string) => {
              setRole(v as BulkImportRole);
              setValidations(null);
              setFileError(null);
              setParsedRows(null);
              setMapping({});
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
              Încarcă CSV / Excel
            </span>
            <input
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
              requiredFields={requiredFields}
              mapping={mapping}
              onMappingChange={(key, value) => setMapping((prev: Record<string, string>) => ({ ...prev, [key]: value }))}
              previewRows={parsedRows.slice(0, 5)}
              errors={mappingErrors}
            />
            <Button
              type="button"
              onClick={runValidation}
              disabled={validateMutation.isPending || mappingErrors.length > 0}
            >
              {validateMutation.isPending ? "Se validează…" : "Validare și previzualizare"}
            </Button>
          </div>
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
                  {validations.rows.map((r: BulkImportValidationResult["rows"][number]) => (
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
              {validations.rows.filter((r: BulkImportValidationResult["rows"][number]) => r.errors.length > 0).length} cu erori
            </span>
          </div>
        </>
      )}
    </div>
  );
}
