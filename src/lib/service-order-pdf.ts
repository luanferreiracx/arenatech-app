/**
 * Service Order PDF generation — placeholder.
 * Real PDF generation will be implemented via puppeteer or react-pdf in a later phase.
 */

export interface ServiceOrderPdfData {
  number: string;
  customerName: string;
  customerCpf: string | null;
  customerPhone: string | null;
  deviceType: string | null;
  deviceBrand: string | null;
  deviceModel: string | null;
  serialNumber: string | null;
  imei: string | null;
  reportedProblem: string | null;
  diagnosedProblem: string | null;
  items: Array<{
    type: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  totalAmount: number;
  discount: number;
  status: string;
  entryDate: string;
  estimatedDate: string | null;
  technicianName: string | null;
  internalNotes: string | null;
  customerNotes: string | null;
}

/**
 * Build the data structure needed for PDF generation.
 * When ready, pass this to a PDF renderer (puppeteer, react-pdf, etc.).
 */
export function buildPdfData(order: Record<string, unknown>): ServiceOrderPdfData {
  const items = (order.items as Array<Record<string, unknown>> | undefined) ?? [];
  const customer = order.customer as Record<string, unknown> | undefined;
  const technician = order.technician as Record<string, unknown> | undefined;

  return {
    number: order.number as string,
    customerName: (customer?.name as string) ?? "",
    customerCpf: (customer?.cpf as string | null) ?? null,
    customerPhone: (customer?.phone as string | null) ?? null,
    deviceType: order.deviceType as string | null,
    deviceBrand: order.deviceBrand as string | null,
    deviceModel: order.deviceModel as string | null,
    serialNumber: order.serialNumber as string | null,
    imei: order.imei as string | null,
    reportedProblem: order.reportedProblem as string | null,
    diagnosedProblem: order.diagnosedProblem as string | null,
    items: items.map((item) => ({
      type: item.type as string,
      description: item.description as string,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
    })),
    totalAmount: Number(order.totalAmount),
    discount: Number(order.discount),
    status: order.status as string,
    entryDate: (order.entryDate as Date | string)?.toString() ?? "",
    estimatedDate: order.estimatedDate
      ? (order.estimatedDate as Date | string).toString()
      : null,
    technicianName: (technician?.name as string | null) ?? null,
    internalNotes: order.internalNotes as string | null,
    customerNotes: order.customerNotes as string | null,
  };
}
