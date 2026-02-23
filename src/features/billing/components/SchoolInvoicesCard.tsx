/**
 * Card read-only: facturile școlii curente (pentru director/secretariat).
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { fetchInvoices, DEFAULT_PRICE_PER_STUDENT, type InvoiceRow } from "../billing.service";
import { useSchool } from "@/hooks/useSchool";

export function SchoolInvoicesCard() {
  const { schoolId } = useSchool();

  const invoicesQuery = useQuery({
    queryKey: ["billing-invoices-school", schoolId],
    queryFn: () => fetchInvoices(schoolId ?? undefined),
    enabled: !!schoolId,
  });

  const invoices = invoicesQuery.data ?? [];

  if (!schoolId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Facturi școală ({DEFAULT_PRICE_PER_STUDENT} lei/elev/an)</CardTitle>
      </CardHeader>
      <CardContent>
        {invoicesQuery.isLoading ? (
          <div className="py-4 flex justify-center">
            <Spinner size="sm" />
          </div>
        ) : invoices.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nicio factură emisă încă.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">An</th>
                  <th className="text-right py-2">Elevi</th>
                  <th className="text-right py-2">Sumă (lei)</th>
                  <th className="text-left py-2">Status</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
