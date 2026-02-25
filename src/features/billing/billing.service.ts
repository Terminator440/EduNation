/**
 * Billing anual: 60 lei/elev/an. Facturare manuală (fără plăți online).
 * Extinde funcționalitatea existentă; nu duplică logică multi-tenant.
 */
import { supabase } from "@/integrations/supabase/client";
import { handleServiceError } from "@/lib/error-handler";
import { AppError } from "@/lib/errors";
import { getFirstZodMessage } from "@/lib/zod-utils";
import { markInvoicePaidSchema, generateInvoiceSchema } from "./schemas/billing.schema";

export const DEFAULT_PRICE_PER_STUDENT = 60;
export const CURRENCY = "RON";

export type SchoolBillingRow = {
  id: string;
  school_id: string;
  price_per_student: number;
  currency: string;
  billing_cycle: string;
  is_active: boolean;
};

export type SubscriptionRow = {
  id: string;
  school_id: string;
  status: "active" | "suspended" | "canceled";
  start_date: string;
  end_date: string;
  billing_year: number;
};

export type InvoiceRow = {
  id: string;
  school_id: string;
  billing_year: number;
  student_count: number;
  price_per_student: number;
  total_amount: number;
  status: "pending" | "paid" | "canceled";
  issued_at: string | null;
  paid_at: string | null;
};

export type SchoolWithBilling = {
  id: string;
  name: string;
  code: string | null;
  student_count: number;
  price_per_student: number;
  estimated_total: number;
  has_invoice_for_current_year: boolean;
  invoice_status?: "pending" | "paid" | "canceled";
};

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Numără elevii activi ai școlii (RPC).
 */
export async function getActiveStudentCount(schoolId: string): Promise<number> {
  const { data, error } = await supabase.rpc("count_active_students_for_school", {
    p_school_id: schoolId,
  });
  if (error) {
    handleServiceError(error, "Număr elevi activi");
    throw error;
  }
  return (data as number) ?? 0;
}

/**
 * Listă facturi pentru școală (sau toate pentru super admin).
 */
export async function fetchInvoices(schoolId?: string | null): Promise<InvoiceRow[]> {
  let query = supabase
    .from("invoices")
    .select("id, school_id, billing_year, student_count, price_per_student, total_amount, status, issued_at, paid_at")
    .order("billing_year", { ascending: false });
  if (schoolId) query = query.eq("school_id", schoolId);
  const { data, error } = await query;
  if (error) {
    handleServiceError(error, "Listă facturi");
    throw error;
  }
  return (data as InvoiceRow[]) ?? [];
}

/**
 * Listă școli cu cost estimat și status factură (pentru super admin).
 */
export async function fetchSchoolsWithBilling(): Promise<SchoolWithBilling[]> {
  const { data: schools, error: schoolsErr } = await supabase
    .from("schools")
    .select("id, name, code")
    .order("name", { ascending: true });
  if (schoolsErr) {
    handleServiceError(schoolsErr, "Listă școli");
    throw schoolsErr;
  }
  if (!schools?.length) return [];

  const { data: invoices } = await supabase
    .from("invoices")
    .select("school_id, billing_year, status")
    .eq("billing_year", CURRENT_YEAR);
  const invoiceBySchool = new Map<string | null, { status: string }>();
  (invoices ?? []).forEach((inv) => {
    if (inv.school_id) invoiceBySchool.set(inv.school_id, { status: inv.status });
  });

  const { data: studentCounts } = await supabase
    .from("students")
    .select("school_id")
    .or("is_active.is.null,is_active.eq.true");
  const countBySchool: Record<string, number> = {};
  (studentCounts ?? []).forEach((r) => {
    const id = r.school_id;
    if (id) countBySchool[id] = (countBySchool[id] ?? 0) + 1;
  });

  const pricePerStudent = DEFAULT_PRICE_PER_STUDENT;
  return schools.map((s) => {
    const count = countBySchool[s.id] ?? 0;
    const inv = invoiceBySchool.get(s.id);
    return {
      id: s.id,
      name: s.name,
      code: s.code,
      student_count: count,
      price_per_student: pricePerStudent,
      estimated_total: count * pricePerStudent,
      has_invoice_for_current_year: !!inv,
      invoice_status: inv?.status as "pending" | "paid" | "canceled" | undefined,
    };
  });
}

/**
 * Generează factură pentru școală și an (doar super admin). RPC.
 */
export async function generateInvoice(schoolId: string, year?: number): Promise<string> {
  const parsed = generateInvoiceSchema.safeParse({ school_id: schoolId, billing_year: year });
  if (!parsed.success) {
    throw new AppError(getFirstZodMessage(parsed.error), { context: "generateInvoice" });
  }
  const y = parsed.data.billing_year ?? new Date().getFullYear();
  const { data, error } = await supabase.rpc("generate_invoice", {
    p_school_id: schoolId,
    p_year: y,
  });
  if (error) {
    handleServiceError(error, "Generare factură");
    throw error;
  }
  return data as string;
}

/**
 * Marchează factura ca plătită (doar super admin). RPC.
 */
export async function markInvoicePaid(invoiceId: string): Promise<boolean> {
  const parsed = markInvoicePaidSchema.safeParse({ invoice_id: invoiceId });
  if (!parsed.success) {
    throw new AppError(getFirstZodMessage(parsed.error), { context: "markInvoicePaid" });
  }
  const { data, error } = await supabase.rpc("mark_invoice_paid", {
    p_invoice_id: parsed.data.invoice_id,
  });
  if (error) {
    handleServiceError(error, "Marcare factură plătită");
    throw error;
  }
  return data === true;
}

/**
 * Recalculează factura pentru școală și anul curent (actualizează număr elevi și total).
 * Echivalent POST /billing/recalculate. Doar super admin.
 */
export async function recalculateBilling(schoolId: string): Promise<string> {
  return generateInvoice(schoolId, CURRENT_YEAR);
}
