/**
 * Extrai um quadro representativo de um vídeo, pra visão do Talison.
 *
 * O modelo não assiste vídeo, mas um terço dos stories do Instagram chega como
 * vídeo (92 de 272 em 45 dias, varredura de 01/08/2026) — e o anúncio costuma
 * mostrar o produto o tempo todo. Um quadro basta pra identificar o modelo.
 *
 * Baixamos o vídeo NÓS MESMOS (o Chatwoot responde com redirect do
 * active_storage) e passamos por stdin pro ffmpeg, que devolve um JPEG no
 * stdout. Nada toca o disco e o ffmpeg não faz rede.
 *
 * Devolve `null` em qualquer falha — quem chama mantém o comportamento antigo
 * de pedir o modelo ao cliente. Degradar é aceitável; travar não.
 */

import { spawn } from "node:child_process";
import { logger } from "@/lib/logger";

const DOWNLOAD_TIMEOUT_MS = 20_000;
const FFMPEG_TIMEOUT_MS = 15_000;
/** Vídeo de story raramente passa disso; o teto evita segurar memória à toa. */
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const FRAME_MEDIA_TYPE = "image/jpeg";

export type VideoFrame = { base64: string; mediaType: typeof FRAME_MEDIA_TYPE };

/**
 * `thumbnail` escolhe o quadro mais representativo de um lote, em vez do
 * primeiro — que em vídeo costuma ser preto ou de transição.
 */
const FFMPEG_ARGS = [
  "-loglevel", "error",
  "-i", "pipe:0",
  "-vf", "thumbnail",
  "-frames:v", "1",
  "-f", "image2",
  "-vcodec", "mjpeg",
  "pipe:1",
];

async function downloadVideo(videoUrl: string): Promise<Buffer | null> {
  try {
    const response = await fetch(videoUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) {
      logger.warn("Talison vídeo: download falhou", { status: response.status });
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_VIDEO_BYTES) {
      logger.warn("Talison vídeo: vazio ou grande demais", { bytes: buffer.byteLength });
      return null;
    }
    return buffer;
  } catch (error) {
    logger.warn("Talison vídeo: erro ao baixar", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function runFfmpeg(video: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    // Args em array (sem shell): a URL nunca chega ao ffmpeg e não há injeção.
    const child = spawn("ffmpeg", FFMPEG_ARGS);
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (frame: Buffer | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(frame);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      logger.warn("Talison vídeo: ffmpeg estourou o tempo");
      finish(null);
    }, FFMPEG_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", (error) => {
      logger.warn("Talison vídeo: ffmpeg não executou", { error: error.message });
      finish(null);
    });
    child.on("close", (code) => {
      const frame = Buffer.concat(chunks);
      if (code !== 0 || frame.byteLength === 0) {
        logger.warn("Talison vídeo: ffmpeg não produziu quadro", { code, bytes: frame.byteLength });
        finish(null);
        return;
      }
      finish(frame);
    });

    // EPIPE é esperado: o ffmpeg fecha a entrada assim que tem o quadro.
    child.stdin.on("error", () => {});
    child.stdin.end(video);
  });
}

export async function extractVideoFrame(videoUrl: string): Promise<VideoFrame | null> {
  const video = await downloadVideo(videoUrl);
  if (!video) return null;

  const frame = await runFfmpeg(video);
  if (!frame) return null;

  return { base64: frame.toString("base64"), mediaType: FRAME_MEDIA_TYPE };
}
