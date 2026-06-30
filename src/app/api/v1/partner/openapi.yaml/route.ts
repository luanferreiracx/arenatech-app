/**
 * Serve o OpenAPI da API de parceiros (ADR 0057) como YAML, PÚBLICO (sem auth).
 * A spec é montada em runtime a partir dos schemas Zod (`buildOpenApiSpec`) — sempre
 * reflete o contrato do deploy atual, sem ler arquivo do disco. O `servers[0].url`
 * é resolvido pelo host da requisição para o "Try it out" do Swagger UI bater na
 * própria origem. A spec é o contrato público (não contém segredo).
 */
import { dump } from "js-yaml";
import { buildOpenApiSpec } from "@/lib/partner-api/openapi-spec";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  const origin = new URL(req.url).origin;
  const spec = buildOpenApiSpec(origin);
  const body = dump(spec, { lineWidth: 100, noRefs: true, sortKeys: false });
  return new Response(body, {
    headers: {
      "content-type": "application/yaml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
