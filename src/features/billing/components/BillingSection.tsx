/**
 * Secțiune Billing pentru Super Admin: școli, cost estimat, facturi, generare/marcare plătită.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  fetchSchoolsWithBilling,
  fetchInvoices,
  generateInvoice,
  markInvoicePaid,
  recalculateBilling,
  DEFAULT_PRICE_PER_STUDENT,
  type SchoolWithBilling,
  type InvoiceRow,
} from "../billing.service";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const CURRENT_YEAR = new Date().getFullYear();

export function BillingSection() {
  const { activeRole } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");

  const isSuperAdmin = activeRole === "uat_admin" || activeRole === "developer";

  const schoolsQuery = useQuery({
    queryKey: ["billing-schools"],
    queryFn: fetchSchoolsWithBilling,
    enabled: isSuperAdmin,
  });

  const invoicesQuery = useQuery({
    queryKey: ["billing-invoices", selectedSchoolId],
    queryFn: () => fetchInvoices(selectedSchoolId || undefined),
    enabled: isSuperAdmin,
  });

  const generateMutation = useMutation({
    mutationFn: ({ schoolId, year }: { schoolId: string; year: number }) =>
      generateInvoice(schoolId, year),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-schools"] });
      queryClient.invalidateQueries({ queryKey: ["billing-invoices"] });
      toast.success("Factură generată");
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: markInvoicePaid,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-schools"] });
      queryClient.invalidateQueries({ queryKey: ["billing-invoices"] });
      toast.success("Factură marcată ca plătită");
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: recalculateBilling,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-schools"] });
      queryClient.invalidateQueries({ queryKey: ["billing-invoices"] });
      toast.success("Factură recalculată (număr elevi și total actualizate)");
    },
  });

  if (!isSuperAdmin) return null;

  const schools = schoolsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Facturare anuală ({DEFAULT_PRICE_PER_STUDENT} lei/elev)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <Select
              value={selectedSchoolId}
              onValueChange={setSelectedSchoolId}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Selectează școala" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.student_count} elevi – {s.estimated_total} lei)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!selectedSchoolId || generateMutation.isPending}
              onClick={() =>
                selectedSchoolId &&
                generateMutation.mutate({ schoolId: selectedSchoolId, year: CURRENT_YEAR })
              }
            >
              {generateMutation.isPending ? <Spinner size="sm" className="mr-2" /> : null}
              Generează factură {CURRENT_YEAR}
            </Button>
            <Button
              variant="outline"
              disabled={!selectedSchoolId || recalculateMutation.isPending}
              onClick={() => selectedSchoolId && recalculateMutation.mutate(selectedSchoolId)}
            >
              {recalculateMutation.isPending ? <Spinner size="sm" className="mr-2" /> : null}
              Recalculează
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Școală</th>
                  <th className="text-right py-2">Elevi</th>
                  <th className="text-right py-2">Cost estimat (lei)</th>
                  <th className="text-left py-2">Factură {CURRENT_YEAR}</th>
                </tr>
              </thead>
              <tbody>
                {schoolsQuery.isLoading ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center">
                      <Spinner size="sm" className="mx-auto" />
                    </td>
                  </tr>
                ) : (
                  schools.map((s: SchoolWithBilling) => (
                    <tr key={s.id} className="border-b">
                      <td className="py-2">{s.name}</td>
                      <td className="text-right py-2">{s.student_count}</td>
                      <td className="text-right py-2">{s.estimated_total}</td>
                      <td className="py-2">
                        {s.has_invoice_for_current_year ? (
                          <Badge
                            variant={
                              s.invoice_status === "paid"
                                ? "default"
                                : s.invoice_status === "pending"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {s.invoice_status === "paid"
                              ? "Plătită"
                              : s.invoice_status === "pending"
                                ? "În așteptare"
                                : "Anulată"}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Facturi</CardTitle>
        </CardHeader>
        <CardContent>
          {invoicesQuery.isLoading ? (
            <div className="py-4 flex justify-center">
              <Spinner size="sm" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nicio factură.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">An</th>
                    <th className="text-right py-2">Elevi</th>
                    <th className="text-right py-2">Sumă (lei)</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: InvoiceRow) => (
                    <tr key={inv.id} className="border-b">
                      <td className="py-2">{inv.billing_year}</td>
                      <td className="text-right py-2">{inv.student_count}</td>
                      <td className="text-right py-2">{inv.total_amount}</td>
                      <td className="py-2">
                        <Badge
                          variant={
                            inv.status === "paid"
                              ? "default"
                              : inv.status === "pending"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {inv.status === "paid"
                            ? "Plătită"
                            : inv.status === "pending"
                              ? "În așteptare"
                              : "Anulată"}
                        </Badge>
                      </td>
                      <td className="py-2">
                        {inv.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={markPaidMutation.isPending}
                            onClick={() => markPaidMutation.mutate(inv.id)}
                          >
                            Marchează plătită
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
