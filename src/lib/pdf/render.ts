import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

/**
 * Renderiza um Document React-PDF para Buffer.
 * Usado em rotas API e procedures tRPC que precisam de PDF binario.
 */
export async function renderPdfToBuffer(doc: ReactElement<DocumentProps>): Promise<Buffer> {
  return renderToBuffer(doc);
}
