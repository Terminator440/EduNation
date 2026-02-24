/**
 * Reusable column mapping step for CSV import (students, teachers, classes).
 * Renders a dropdown per required field, optional preview table, and validation errors.
 */
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";

export type RequiredField = { key: string; label: string };

export type ColumnMappingStepProps = {
  csvHeaders: string[];
  requiredFields: RequiredField[];
  mapping: Record<string, string>;
  onMappingChange: (fieldKey: string, csvHeader: string) => void;
  /** First N raw rows to show preview (keys = CSV headers, values = cell value) */
  previewRows?: Record<string, string>[];
  /** Validation errors (e.g. "Câmpul X trebuie mapat") */
  errors?: string[];
};

const EMPTY_OPTION = "__none__";

export function ColumnMappingStep({
  csvHeaders,
  requiredFields,
  mapping,
  onMappingChange,
  previewRows = [],
  errors = [],
}: ColumnMappingStepProps) {
  const headers = csvHeaders.length > 0 ? csvHeaders : [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Mapați fiecare câmp obligatoriu la coloana din fișierul încărcat.
      </p>
      <div className="flex flex-wrap gap-6">
        {requiredFields.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-2">
            <Label>{label}</Label>
            <Select
              value={mapping[key] || EMPTY_OPTION}
              onValueChange={(v) => onMappingChange(key, v === EMPTY_OPTION ? "" : v)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Alege coloana" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_OPTION}>— Nu mapa —</SelectItem>
                {headers.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      {errors.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {previewRows.length > 0 && headers.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <p className="text-xs text-muted-foreground p-2 bg-muted/50 border-b">
            Previzualizare (primele {previewRows.length} rânduri)
          </p>
          <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">#</th>
                  {requiredFields.map((f) => (
                    <th key={f.key} className="text-left p-2 font-medium">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{i + 1}</td>
                    {requiredFields.map((f) => (
                      <td key={f.key} className="p-2">
                        {(mapping[f.key] ? (row[mapping[f.key]] ?? "").trim() : "") || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Build mapping errors: required fields that are not mapped. */
export function getMappingErrors(
  requiredFields: RequiredField[],
  mapping: Record<string, string>
): string[] {
  return requiredFields
    .filter((f) => !mapping[f.key]?.trim())
    .map((f) => `Câmpul "${f.label}" trebuie mapat la o coloană.`);
}

/** Extract a single column value from a row using mapping. */
export function getMappedValue(row: Record<string, string>, fieldKey: string, mapping: Record<string, string>): string {
  const header = mapping[fieldKey];
  if (!header) return "";
  return (row[header] ?? "").trim();
}
