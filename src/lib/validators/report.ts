import { z } from "zod";

// ── NF Report ──

export const nfReportSchema = z.object({
  dateFrom: z.string().min(1, "Data inicio obrigatoria"),
  dateTo: z.string().min(1, "Data fim obrigatoria"),
  nfStatus: z.enum(["all", "with_nf", "without_nf"]).optional(),
});
export type NfReportInput = z.infer<typeof nfReportSchema>;

export interface NfReportLine {
  type: "SALE" | "SERVICE_ORDER";
  doc: string;
  date: string;
  customer: string;
  value: number;
  hasNf: boolean;
  nfType: string | null;
  nfNumber: string | number | null;
}

export interface NfReportTotals {
  salesTotal: number;
  salesWithoutNf: number;
  osTotal: number;
  osWithoutNf: number;
  valueTotal: number;
  valueWithoutNf: number;
}
