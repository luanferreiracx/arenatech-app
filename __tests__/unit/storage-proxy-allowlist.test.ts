/**
 * Auditoria 2026-08-05 (P1-B4): `/api/storage/[...path]` serve **qualquer chave**
 * do bucket sem autenticação. O comentário do arquivo dizia "apenas assets
 * públicos", mas o código não restringia prefixo nenhum — a única defesa era o
 * bloqueio de path traversal.
 *
 * O que mais vive no mesmo bucket:
 *
 * | prefixo                              | conteúdo                  |
 * |--------------------------------------|---------------------------|
 * | `tenants/{id}/logo-*`                | logo (público por intenção) |
 * | `tenants/{id}/{kind}/{entityId}/*`   | fotos de produto/OS (idem) |
 * | `nfse/{tenantId}/{orderId}/*`        | **nota fiscal, em claro**  |
 * | `tenants/{id}/certificates/*.pfx.enc`| certificado A1 (cifrado)   |
 *
 * Latente na medição (0 NFS-e anexadas em produção) e o certificado está cifrado
 * com AES-256-GCM — por isso era P1 e não P0. Mas o buraco é real: basta a
 * primeira nota ser emitida.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const send = vi.fn();

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = (...a: unknown[]) => send(...a);
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "@/app/api/storage/[...path]/route";

function req(path: string[]) {
  return GET({} as never, { params: Promise.resolve({ path }) });
}

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({
    Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    ContentType: "image/png",
  });
});

describe("/api/storage — allowlist de prefixo", () => {
  describe("SERVE o que é público por intenção", () => {
    const PERMITIDOS = [
      ["tenants", "t1", "logo-123.png"],
      ["tenants", "t1", "products", "p1", "photo-thumb.webp"],
      ["tenants", "t1", "products", "p1", "variations", "v1.webp"],
      ["tenants", "t1", "service-orders", "os1", "foto.webp"],
    ];

    for (const p of PERMITIDOS) {
      it(`serve ${p.join("/")}`, async () => {
        const res = await req(p);
        expect(res.status).toBe(200);
        expect(send).toHaveBeenCalled();
      });
    }
  });

  describe("RECUSA o que nunca foi para ser público", () => {
    it("nota fiscal de serviço (em claro no bucket)", async () => {
      const res = await req(["nfse", "tenant-x", "order-y", "nota.pdf"]);
      expect(res.status).toBe(404);
      // Não pode nem chegar ao S3: 404 vindo do bucket vs. 404 nosso é a
      // diferença entre negar acesso e confirmar que a chave não existe.
      expect(send).not.toHaveBeenCalled();
    });

    it("certificado digital A1", async () => {
      const res = await req(["tenants", "t1", "certificates", "cert.pfx.enc"]);
      expect(res.status).toBe(404);
      expect(send).not.toHaveBeenCalled();
    });

    it("chave fora de qualquer prefixo conhecido", async () => {
      const res = await req(["backup", "dump.sql"]);
      expect(res.status).toBe(404);
      expect(send).not.toHaveBeenCalled();
    });

    it("raiz do bucket", async () => {
      const res = await req([""]);
      expect(res.status).toBe(404);
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe("defesas que já existiam continuam de pé", () => {
    it("path traversal", async () => {
      const res = await req(["tenants", "..", "..", "etc", "passwd"]);
      expect(res.status).toBe(400);
      expect(send).not.toHaveBeenCalled();
    });

    it("traversal disfarçado dentro de prefixo permitido", async () => {
      const res = await req(["tenants", "t1", "..", "..", "nfse", "x", "y", "n.pdf"]);
      expect(res.status).toBe(400);
      expect(send).not.toHaveBeenCalled();
    });
  });

  it("chave inexistente no bucket devolve 404 (sem vazar erro do S3)", async () => {
    send.mockImplementation(() => {
      const e = new Error("no such key");
      (e as { name?: string }).name = "NoSuchKey";
      throw e;
    });
    const res = await req(["tenants", "t1", "logo-nao-existe.png"]);
    expect(res.status).toBe(404);
  });
});
