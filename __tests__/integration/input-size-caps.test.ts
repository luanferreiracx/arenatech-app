/**
 * Auditoria 2026-07-25 — item 24: campos de texto sem teto de tamanho.
 *
 * O achado original falava em "165 `z.string()` sem `.max()` — campos de busca
 * que alimentam `contains`". A medição em 2026-07-28 corrigiu as duas metades
 * dessa frase:
 *
 *  - **A busca NÃO é o risco.** `contains` com 1.000.000 de caracteres roda em
 *    37ms e devolve 0 linhas: o Postgres descarta pelo comprimento antes de
 *    comparar. Idem `dateFrom`/`dateTo` — `new Date(lixo)` vira `Invalid Date`
 *    e o Prisma rejeita com erro de argumento.
 *
 *  - **O risco é o texto que PERSISTE.** 505 das 542 colunas de texto do schema
 *    são `TEXT` puro, sem limite (o Postgres aceita até 1GB por valor). Um
 *    validador sem teto sobre uma dessas colunas é armazenamento gratuito:
 *    medido, `customers.notes` engoliu **20 MB numa requisição, em 185ms**.
 *
 * Um operador com sessão válida (ou um token de integração vazado) enche o
 * disco do banco sem estourar nenhum guard: não é o dado que é perigoso, é o
 * tamanho. O backup cresce junto, o dump fica lento, e nada nos logs denuncia.
 *
 * Este teste cobre as duas famílias mais caras: o texto livre que persiste e o
 * payload binário (certificado A1) que vira Buffer e passa por criptografia.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "input-size-caps";
let tenantId: string, adminId: string, ctx: any;
const customerIds: string[] = [];

const caller = () => createCallerFactory(appRouter)(ctx);

/** 5 MB de texto — bem além de qualquer observação legítima. */
const TEXTO_ABSURDO = "x".repeat(5_000_000);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  ctx = {
    session: {
      user: { id: adminId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [
        { id: tenantId, slug: "arena-tech", role: "admin", modules: ["customers", "fiscal", "settings"] },
      ],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
});

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { tenantId, name: { contains: MARK } } });
  await prisma.$disconnect();
});

describe("24 — texto livre que persiste tem teto", () => {
  it("observação de cliente com 5 MB é recusada na validação", async () => {
    await expect(
      caller().customer.create({
        type: "PF",
        cpf: "39053344705",
        name: `${MARK}-cliente`,
        phone: "11900001111",
        notes: TEXTO_ABSURDO,
      }),
    ).rejects.toThrow();

    // Nada foi gravado — a recusa acontece antes do banco.
    const gravados = await prisma.customer.count({ where: { tenantId, name: `${MARK}-cliente` } });
    expect(gravados).toBe(0);
  });

  it("observação de tamanho normal continua passando (o teto não atrapalha o uso real)", async () => {
    const criado = await caller().customer.create({
      type: "PF",
      cpf: "52998224725",
      name: `${MARK}-normal`,
      phone: "11900002222",
      notes: "Cliente prefere contato por WhatsApp depois das 18h.",
    });
    customerIds.push(criado.id);

    const row = await prisma.customer.findUniqueOrThrow({ where: { id: criado.id } });
    expect(row.notes).toContain("WhatsApp");
  });
});

describe("24 — payload binário tem teto", () => {
  it("certificado A1 de 5 MB é recusado antes de virar Buffer e ser criptografado", async () => {
    // O tamanho importa aqui por CPU, não por disco: `pfxBase64` vira
    // `Buffer.from(..., "base64")` e passa por validação + criptografia.
    // ATENÇÃO ao escrever este teste: sem `.max()` a chamada TAMBÉM falha —
    // mas lá na frente, com "Certificado inválido: Too few bytes to read ASN.1
    // value", depois de decodificar 5 MB de base64 e mandar pro parser. Um
    // `rejects.toThrow()` cru passaria com e sem a correção, provando nada.
    // Por isso o assert exige a mensagem do TETO e recusa a do parser.
    let erro: string | null = null;
    try {
      await caller().settings.updateFiscalCertificate({
        pfxBase64: Buffer.from(TEXTO_ABSURDO).toString("base64"),
        password: "senha-do-certificado",
      });
    } catch (e) {
      erro = (e as Error).message;
    }
    expect(erro).not.toBeNull();
    expect(erro).toMatch(/muito grande|too_big|máximo|maximo/i);
    expect(erro).not.toMatch(/ASN\.1/i);
  });
});
