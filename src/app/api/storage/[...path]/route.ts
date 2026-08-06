import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy publico para arquivos do MinIO. Permite que o navegador acesse a
 * logo do tenant (e outros assets) sem expor diretamente as credenciais ou
 * a URL interna do bucket. URL publica:
 *
 *   /api/storage/tenants/{tenantId}/logo-xxxx.png
 *
 * Cacheable (max-age 1 hora). Sem autenticacao — apenas assets publicos.
 */

/**
 * Prefixos que esta rota pode servir.
 *
 * O comentario acima sempre disse "apenas assets publicos", mas o codigo nao
 * restringia nada: servia QUALQUER chave do bucket (auditoria 2026-08-05,
 * P1-B4). E o bucket tambem guarda:
 *
 *   - `nfse/{tenantId}/{orderId}/...`        nota fiscal de servico, EM CLARO
 *   - `tenants/{id}/certificates/*.pfx.enc`  certificado digital A1 (cifrado)
 *
 * Bastava saber tenantId + orderId para baixar a nota fiscal de outro tenant.
 * Era latente na medicao (0 NFS-e anexadas em producao) e o certificado esta
 * cifrado com AES-256-GCM — por isso P1 e nao P0. Mas o buraco fecha agora, nao
 * quando a primeira nota for emitida.
 *
 * Allowlist e nao blocklist: uma lista de proibidos precisa ser atualizada toda
 * vez que alguem grava um prefixo novo no bucket, e esquecer disso volta a
 * expor. Aqui, prefixo novo nasce inacessivel ate ser declarado — o custo do
 * esquecimento e um 404, nao um vazamento.
 */
const PUBLIC_PREFIXES = [
  /** Logo do tenant: `tenants/{id}/logo-*.{ext}` (tenant-logo-service.ts:45) */
  /^tenants\/[^/]+\/logo-[^/]+$/,
  /** Imagens: `tenants/{id}/{kind}/{entityId}/...` (product-image-service.ts:83) */
  /^tenants\/[^/]+\/(products|service-orders|purchases|valuations)\/[^/]+\/.+$/,
];

/** A chave e servivel por esta rota publica? */
function isPublicKey(key: string): boolean {
  return PUBLIC_PREFIXES.some((re) => re.test(key));
}
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = path.join("/");

  // Bloqueia path traversal.
  if (key.includes("..") || key.startsWith("/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Fora da allowlist: 404 SEM tocar no bucket. Devolver o 404 do S3 diria ao
  // atacante se a chave existe — 404 nosso nega acesso sem confirmar nada.
  if (!isPublicKey(key)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const endpoint = process.env.S3_ENDPOINT || "http://localhost:9000";
  const bucket = process.env.S3_BUCKET || "arenatech";
  const accessKey = process.env.S3_ACCESS_KEY || "minioadmin";
  const secretKey = process.env.S3_SECRET_KEY || "minioadmin";

  try {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: "us-east-1",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const buffer = Buffer.from(await res.Body.transformToByteArray());
    const contentType = res.ContentType ?? "application/octet-stream";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(buffer as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === "NoSuchKey") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    logger.error("Storage proxy error:", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
