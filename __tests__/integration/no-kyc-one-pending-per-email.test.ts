/**
 * Onboarding NO-KYC — um pré-cadastro PENDENTE por e-mail.
 *
 * 2026-07-29: `startRegistration` é read-then-write (busca o PENDING do mesmo
 * e-mail, senão insere) e a tabela não tinha índice nenhum além da primary key.
 * Duas requisições simultâneas do mesmo interessado — duplo-clique, retry do
 * navegador — criavam DUAS linhas PENDING. A fila de aprovação do superadmin
 * mostrava o mesmo cadastro duas vezes e só uma delas seguia recebendo os
 * códigos; a outra ficava presa lá, indistinguível de um cadastro real.
 *
 * Duas camadas, como no caso da NF-e duplicada: reuso na procedure (o caminho
 * normal de quem refaz o cadastro) + índice único parcial no banco, que fecha a
 * janela de corrida do read-then-write.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const MARK = "nokyc-one-pending";
const EMAIL = `${MARK}@exemplo.test`;
const SENHA = "SenhaValida123";

/**
 * Cada teste usa um IP próprio: o rate-limit de `startRegistration` é 5/hora por
 * IP, e um balde compartilhado faria o 3º teste falhar por motivo errado.
 */
function caller(ip: string) {
  return createCallerFactory(appRouter)({
    session: null,
    tenantId: null,
    headers: new Headers({ "x-forwarded-for": ip }),
    withTenant: (fn: any) => fn(prisma),
  } as any);
}

function dadosCadastro(email = EMAIL, senha = SENHA) {
  return {
    ownerName: "Interessado Teste",
    tradeName: "Loja Teste",
    email,
    phone: "86999990000",
    password: senha,
    confirmPassword: senha,
    // Aceite obrigatório no servidor desde o ADR 0065.
    acceptedTerms: true as const,
  };
}

async function limpar() {
  const prs = await prisma.preRegistration.findMany({
    where: { ownerEmail: { contains: MARK } },
    select: { id: true },
  });
  const ids = prs.map((p) => p.id);
  await prisma.verificationCode.deleteMany({ where: { preRegistrationId: { in: ids } } });
  await prisma.verificationCode.deleteMany({ where: { target: { contains: MARK } } });
  await prisma.preRegistration.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(limpar);

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe("NO-KYC — um pré-cadastro pendente por e-mail", () => {
  it("refazer o cadastro com o mesmo e-mail reaproveita o registro, não duplica", async () => {
    const primeira = await caller("203.0.113.11").noKyc.startRegistration(dadosCadastro());
    // Senha diferente de propósito: quem refaz o cadastro pode ter esquecido a
    // que digitou antes, e o registro é reescrito por inteiro.
    const segunda = await caller("203.0.113.11").noKyc.startRegistration(
      dadosCadastro(EMAIL, "OutraSenha456"),
    );

    expect(segunda.preRegistrationId).toBe(primeira.preRegistrationId);
    expect(await prisma.preRegistration.count({ where: { ownerEmail: EMAIL } })).toBe(1);
  });

  it("o banco tem a rede: índice único parcial impede o 2º PENDENTE sob corrida", async () => {
    await caller("203.0.113.12").noKyc.startRegistration(dadosCadastro());

    // Bypassa a procedure (simula a janela do read-then-write) e escreve direto.
    await expect(
      prisma.preRegistration.create({
        data: {
          tradeName: "Loja Teste",
          ownerName: "Interessado Teste",
          ownerEmail: EMAIL,
          ownerPhone: "86999990000",
          passwordHash: "hash-irrelevante",
        },
      }),
    ).rejects.toThrow();
  });

  it("depois de REJEITADO, o e-mail pode se cadastrar de novo (fluxo normal)", async () => {
    const primeira = await caller("203.0.113.13").noKyc.startRegistration(dadosCadastro());
    await prisma.preRegistration.update({
      where: { id: primeira.preRegistrationId },
      data: { status: "REJECTED" },
    });

    const segunda = await caller("203.0.113.13").noKyc.startRegistration(dadosCadastro());

    expect(segunda.preRegistrationId).not.toBe(primeira.preRegistrationId);
    expect(
      await prisma.preRegistration.count({ where: { ownerEmail: EMAIL, status: "PENDING" } }),
    ).toBe(1);
  });
});
