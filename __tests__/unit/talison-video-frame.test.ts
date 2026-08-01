/**
 * Extração de quadro de vídeo — entrada da visão quando o cliente manda vídeo.
 *
 * Um terço dos stories do Instagram chega como vídeo (92 de 272 em 45 dias) e o
 * modelo não assiste vídeo. Extraímos um quadro representativo e mandamos pra
 * visão como imagem. Qualquer falha devolve null — o chamador mantém o
 * comportamento antigo (pedir o modelo ao cliente).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock("node:child_process", () => ({ spawn }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { extractVideoFrame } from "@/lib/talison/providers/video-frame";

const realFetch = global.fetch;

function mockVideoResponse(bytes: Uint8Array) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

/** ffmpeg falso: emite `frameBytes` no stdout e encerra com `exitCode`. */
function mockFfmpeg(frameBytes: Uint8Array | null, exitCode = 0) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: () => void;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();

  queueMicrotask(() => {
    if (frameBytes) child.stdout.write(Buffer.from(frameBytes));
    child.stdout.end();
    child.stderr.end();
    child.emit("close", exitCode);
  });

  return child;
}

describe("extractVideoFrame", () => {
  beforeEach(() => {
    spawn.mockReset();
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("baixa o vídeo e devolve o quadro em base64", async () => {
    const frame = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    global.fetch = vi.fn().mockResolvedValue(mockVideoResponse(new Uint8Array([1, 2, 3]))) as typeof fetch;
    // mockImplementation, não mockReturnValue: o filho falso precisa nascer
    // quando o spawn é chamado, senão os eventos disparam antes dos listeners.
    spawn.mockImplementation(() => mockFfmpeg(frame));

    const result = await extractVideoFrame("https://chatwoot/story.mp4");

    expect(result).toEqual({
      base64: Buffer.from(frame).toString("base64"),
      mediaType: "image/jpeg",
    });
  });

  it("devolve null quando o download do vídeo falha", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network")) as typeof fetch;
    spawn.mockImplementation(() => mockFfmpeg(new Uint8Array([1])));

    expect(await extractVideoFrame("https://chatwoot/story.mp4")).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("devolve null quando o ffmpeg sai com erro", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockVideoResponse(new Uint8Array([1, 2, 3]))) as typeof fetch;
    spawn.mockImplementation(() => mockFfmpeg(null, 1));

    expect(await extractVideoFrame("https://chatwoot/story.mp4")).toBeNull();
  });

  it("devolve null quando o ffmpeg sai limpo mas sem quadro", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockVideoResponse(new Uint8Array([1, 2, 3]))) as typeof fetch;
    spawn.mockImplementation(() => mockFfmpeg(null, 0));

    expect(await extractVideoFrame("https://chatwoot/story.mp4")).toBeNull();
  });

  it("devolve null quando o ffmpeg nem executa (binário ausente)", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockVideoResponse(new Uint8Array([1, 2, 3]))) as typeof fetch;
    spawn.mockImplementation(() => {
      const child = mockFfmpeg(null, 0);
      queueMicrotask(() => child.emit("error", new Error("spawn ffmpeg ENOENT")));
      return child;
    });

    expect(await extractVideoFrame("https://chatwoot/story.mp4")).toBeNull();
  });
});
