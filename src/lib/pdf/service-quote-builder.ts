import { renderPdfToBuffer } from "@/lib/pdf/render";
import { ServiceQuotePdf, type ServiceQuotePdfData } from "./service-quote-pdf";

/**
 * Renderiza o orcamento avulso de servico como PDF buffer a partir do payload
 * ja calculado (transient — nao persiste no banco). Servido pela rota de midia
 * que a Meta baixa ao enviar o template `servico_orcamento_pdf` (HEADER DOCUMENT).
 */
export async function renderServiceQuotePdfBuffer(
  data: ServiceQuotePdfData,
): Promise<Buffer> {
  return renderPdfToBuffer(ServiceQuotePdf({ data }));
}
