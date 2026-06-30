import type { Metadata } from "next";
import { SwaggerViewer } from "./swagger-viewer";

export const metadata: Metadata = {
  title: "API de Parceiros | Arena Tech",
  description:
    "Documentação interativa (OpenAPI/Swagger) da API de parceiros DePix da Arena Tech.",
};

/** Página pública de documentação interativa da API de parceiros. */
export default function PartnerApiDocsPage() {
  return <SwaggerViewer specUrl="/api/v1/partner/openapi.yaml" />;
}
