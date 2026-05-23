import { NextRequest, NextResponse } from "next/server";

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
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === "NoSuchKey") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Storage proxy error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
