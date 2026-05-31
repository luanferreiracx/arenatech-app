import { renderPdfToBuffer } from "@/lib/pdf/render";
import { SimulatorPdf, type SimulatorPdfData } from "./simulator-pdf";

/**
 * Renderiza a simulacao de parcelamento como PDF buffer a partir do payload
 * ja calculado (transient — nao persiste no banco). Usado pela rota de midia
 * que a Meta baixa ao enviar o template `simulacao_pdf` com HEADER DOCUMENT.
 */
export async function renderSimulatorPdfBuffer(
  data: SimulatorPdfData,
): Promise<Buffer> {
  return renderPdfToBuffer(SimulatorPdf({ data }));
}
