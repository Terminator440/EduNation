import { z } from "zod";

export const markInvoicePaidSchema = z.object({
  invoice_id: z.string().uuid("ID factură invalid"),
});

export const generateInvoiceSchema = z.object({
  school_id: z.string().uuid("ID școală invalid"),
  billing_year: z.number().int().min(2020).max(2100).optional(),
});

export type MarkInvoicePaidInput = z.infer<typeof markInvoicePaidSchema>;
export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>;
