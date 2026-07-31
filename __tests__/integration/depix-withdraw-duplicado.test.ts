/**
 * SQ-1 — guarda contra saque duplicado, independente da chave do cliente.
 *
 * Incidente relatado pelo dono (2ª ocorrência): ao sacar, ele fechou a janela,
 * abriu de novo, viu um erro e o botão verde voltou armado. **Não clicou** — por
 * desconfiança, já que a mesma coisa tinha acontecido antes — e o saque saiu
 * assim mesmo. Se tivesse clicado, o destinatário receberia duas vezes.
 *
 * O servidor já deduplicava por `idempotencyKey`, e a documentação do serviço
 * afirma: *"2a chamada com mesma key retorna o registro existente sem efeito"*.
 * A garantia inteira dependia de o CLIENTE reenviar a mesma chave — e a tela a
 * cunhava com `useMemo(() => crypto.randomUUID(), [])`, que vive enquanto o
 * componente está montado. Fechar e reabrir gera chave nova.
 *
 * Ou seja: a proteção evaporava exatamente no gesto de quem ficou na dúvida se o
 * saque saiu — que é quando ela mais importa.
 *
 * Este teste chama `createWithdraw` DUAS vezes com chaves DIFERENTES e a mesma
 * intenção (mesma chave PIX, mesmo valor), que é o que a remontagem produz.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import { createWithdraw } from "@/server/services/depix-transaction.service";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const CHAVE_PIX = "11999887766";
const LIQUIDO_CENTS = 25_000;
let tenantId: string;
let userId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  tenantId = tenant.id;
  userId = (await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } })).id;
});

beforeEach(async () => {
  await prisma.tenantDepixTransaction.deleteMany({ where: { tenantId, pixKey: CHAVE_PIX } });
});

afterAll(async () => {
  await prisma.tenantDepixTransaction.deleteMany({ where: { tenantId, pixKey: CHAVE_PIX } });
  await prisma.$disconnect();
});

/** Um saque já existente, no estado em que a guarda deve bloquear. */
async function saqueExistente(status: string, minutosAtras = 2) {
  return prisma.tenantDepixTransaction.create({
    data: {
      tenantId,
      number: `TXW-TESTE-${Date.now()}`,
      kind: "WITHDRAW",
      status: status as never,
      pixKeyType: "PHONE",
      pixKey: CHAVE_PIX,
      recipientName: "Destinatario Teste",
      recipientTaxId: "00000000191",
      grossAmountCents: LIQUIDO_CENTS + 500,
      netAmountCents: LIQUIDO_CENTS,
      feeArenaTechCents: 500,
      feePixPayCents: 0,
      userId,
      userName: "Admin Arena",
      idempotencyKey: randomUUID(),
      createdAt: new Date(Date.now() - minutosAtras * 60_000),
    },
  });
}

function novoSaque() {
  return createWithdraw({
    tenantId,
    userId,
    userName: "Admin Arena",
    pixKeyType: "PHONE",
    pixKey: CHAVE_PIX,
    recipientName: "Destinatario Teste",
    recipientTaxId: "00000000191",
    netAmountCents: LIQUIDO_CENTS,
    // Chave NOVA — é o que a remontagem da tela produz.
    idempotencyKey: randomUUID(),
  } as never);
}

describe("SQ-1 — segundo saque igual, com chave de idempotência diferente", () => {
  for (const status of ["PENDING", "PROCESSING", "COMPLETED"]) {
    it(`é recusado quando já existe um ${status} recente`, async () => {
      const anterior = await saqueExistente(status);

      await expect(novoSaque()).rejects.toThrow(/Ja existe um saque igual/i);

      // E nada foi criado: o bloqueio acontece ANTES de qualquer efeito.
      const total = await prisma.tenantDepixTransaction.count({
        where: { tenantId, pixKey: CHAVE_PIX },
      });
      expect(total, "não pode nascer um segundo saque").toBe(1);
      expect((await prisma.tenantDepixTransaction.findFirstOrThrow({
        where: { tenantId, pixKey: CHAVE_PIX },
      })).id).toBe(anterior.id);
    });
  }

  it("a mensagem nomeia a transação anterior, para o operador decidir com informação", async () => {
    const anterior = await saqueExistente("COMPLETED");
    await expect(novoSaque()).rejects.toThrow(new RegExp(anterior.number));
  });

  it("saque que a Eulen RECUSOU não bloqueia a nova tentativa", async () => {
    // FAILED não moveu dinheiro (ex.: limite diário estourado). Bloquear aqui
    // deixaria o operador preso sem motivo.
    await saqueExistente("FAILED");
    await expect(novoSaque()).rejects.not.toThrow(/Ja existe um saque igual/i);
  });

  it("fora da janela de 10 min, não bloqueia", async () => {
    await saqueExistente("COMPLETED", 15);
    await expect(novoSaque()).rejects.not.toThrow(/Ja existe um saque igual/i);
  });
});
