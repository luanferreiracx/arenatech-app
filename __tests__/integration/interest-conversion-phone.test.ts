/**
 * Finalização — Módulo 9, CL-1: a conversão automática de lead casava por
 * igualdade exata de telefone e por isso nunca casava.
 *
 * O mesmo telefone entra no sistema em formatos diferentes conforme a origem:
 *
 *   cadastro de cliente   → "(86) 99999-9999"  → 11 dígitos ao normalizar
 *   interesse pelo painel → normalizado, mas com DDI se o operador digitou → 13
 *   interesse pelo bot    → telefone cru do WhatsApp → 12 a 16
 *
 * Medido em produção antes da correção: dos 75 interesses abertos, **nenhum**
 * tinha os 11 dígitos usados por 1.278 dos 1.384 clientes; 23 estavam mascarados;
 * e **6 pertenciam a clientes que compraram ou abriram OS depois de virar lead**.
 * O painel de conversão marcava 0% com pelo menos 8% real.
 *
 * A correção tem três partes e o teste cobre as três:
 *   1. chave de comparação = últimos 8 dígitos (`phoneMatchKey`);
 *   2. o bot passa a gravar normalizado;
 *   3. migration normaliza o que já estava gravado (senão o mascarado escapa).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withTenant } from "@/server/db";
import { linkInterestConversionByPhone } from "@/server/services/interest-conversion.service";
import { phoneMatchKey } from "@/lib/validators/customer";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let tenantId: string;

/** Mesmo número, nos formatos que o sistema realmente produz. */
const NUMERO = {
  cadastroDeCliente: "(86) 99123-4567", // 11 dígitos
  painelComDdi: "5586991234567", // 13 dígitos
  botDoWhatsapp: "558699123456700", // cru, com sufixo do provedor
  mascaradoLegado: "+55 (86) 99123-4567",
};

beforeAll(async () => {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "conv-lead-test" },
    update: {},
    create: { slug: "conv-lead-test", name: "Conversao Lead Test", status: "ACTIVE" },
  });
  tenantId = tenant.id;
});

beforeEach(async () => {
  await prisma.interest.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  await prisma.interest.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

async function criarInteresse(phone: string, criadoEm = new Date(Date.UTC(2026, 0, 1))) {
  return prisma.interest.create({
    data: {
      tenantId,
      customerName: "Lead de Teste",
      phone,
      type: "PURCHASE",
      desiredModel: "iPhone 15",
      status: "WAITING",
      createdAt: criadoEm,
    },
  });
}

async function converter(phoneDaVenda: string) {
  return withTenant(tenantId, (tx) =>
    linkInterestConversionByPhone(tx, {
      tenantId,
      phone: phoneDaVenda,
      saleId: undefined,
    }),
  );
}

describe("phoneMatchKey", () => {
  it("reduz todos os formatos ao mesmo número de assinante", () => {
    const esperado = "91234567";
    expect(phoneMatchKey(NUMERO.cadastroDeCliente)).toBe(esperado);
    expect(phoneMatchKey(NUMERO.painelComDdi)).toBe(esperado);
    expect(phoneMatchKey(NUMERO.mascaradoLegado)).toBe(esperado);
  });

  it("recusa o que é curto demais para ser chave confiável", () => {
    expect(phoneMatchKey("1234")).toBe("");
    expect(phoneMatchKey("")).toBe("");
    expect(phoneMatchKey(null)).toBe("");
  });
});

describe("CL-1 — conversão casa o telefone entre origens diferentes", () => {
  it("lead do painel com DDI converte numa venda do cliente sem DDI", async () => {
    const lead = await criarInteresse(NUMERO.painelComDdi);

    const convertido = await converter(NUMERO.cadastroDeCliente);

    expect(convertido).toBe(lead.id);
    const depois = await prisma.interest.findUniqueOrThrow({ where: { id: lead.id } });
    expect(depois.status).toBe("COMPLETED");
    expect(depois.convertedAt).not.toBeNull();
  });

  it("lead gravado pelo bot também converte", async () => {
    // O bot gravava o telefone cru do WhatsApp; agora normaliza, mas o casamento
    // tem que continuar tolerante ao que já está no banco.
    const lead = await criarInteresse(NUMERO.painelComDdi);

    expect(await converter(NUMERO.botDoWhatsapp.slice(0, 13))).toBe(lead.id);
  });

  it("telefone de outro cliente não converte lead alheio", async () => {
    await criarInteresse(NUMERO.painelComDdi);

    expect(await converter("(86) 98888-1111")).toBeNull();
  });

  it("não mexe em lead já fechado", async () => {
    const lead = await criarInteresse(NUMERO.painelComDdi);
    await prisma.interest.update({ where: { id: lead.id }, data: { status: "CANCELLED" } });

    expect(await converter(NUMERO.cadastroDeCliente)).toBeNull();
    const depois = await prisma.interest.findUniqueOrThrow({ where: { id: lead.id } });
    expect(depois.status).toBe("CANCELLED");
  });

  it("com dois leads abertos no mesmo telefone, converte o mais antigo", async () => {
    const antigo = await criarInteresse(NUMERO.painelComDdi, new Date(Date.UTC(2026, 0, 1)));
    await criarInteresse(NUMERO.cadastroDeCliente, new Date(Date.UTC(2026, 5, 1)));

    expect(await converter(NUMERO.cadastroDeCliente)).toBe(antigo.id);
  });

  it("telefone curto não vira chave (evita falso-positivo)", async () => {
    await criarInteresse("1234");

    expect(await converter("1234")).toBeNull();
  });
});
