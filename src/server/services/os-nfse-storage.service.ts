import { logger } from "@/lib/logger";

const BUCKET = process.env.S3_BUCKET || process.env.MINIO_BUCKET || "arenatech";
const ENDPOINT =
  process.env.S3_ENDPOINT || process.env.MINIO_ENDPOINT || "http://localhost:9000";

/**
 * Apaga um anexo de NFS-e do MinIO. Best-effort: se falhar, loga e segue —
 * a OS ja foi atualizada no banco e nao queremos travar o fluxo por isso
 * (cron de limpeza pode varrer orfaos depois). Usado pelo attach (apos
 * substituir o anexo), pelo detach e pelo update (toggle nfseIssued=false).
 */
export async function deleteNfseAttachment(orderId: string, key: string): Promise<void> {
  try {
    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: "us-east-1",
      endpoint: ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
        secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
      },
    });
    // F9 (auditoria OS): timeout — MinIO pendurado não segura a request (SDK v3
    // não tem timeout de socket por default).
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    logger.warn("Falha ao apagar NFS-e do MinIO", {
      orderId, key, error: err instanceof Error ? err.message : String(err),
    });
  }
}
