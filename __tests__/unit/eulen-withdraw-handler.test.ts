/**
 * handleEulenWithdrawWebhook: sent->COMPLETED (+onWithdrawCompleted),
 * error/refunded->FAILED, sending->PROCESSING, idempotencia, terminal->skip.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const recordWebhookEvent = vi.fn();
const markWebhookProcessed = vi.fn();
const onWithdrawCompleted = vi.fn();

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: unknown) => unknown) =>
    fn({ tenantDepixTransaction: { findFirst, update, updateMany } }),
}));
vi.mock("@/lib/webhooks/replay-guard", () => ({
  recordWebhookEvent: (...a: unknown[]) => recordWebhookEvent(...a),
  markWebhookProcessed: (...a: unknown[]) => markWebhookProcessed(...a),
}));
vi.mock("@/server/services/depix-transaction.service", () => ({
  onWithdrawCompleted: (...a: unknown[]) => onWithdrawCompleted(...a),
}));
vi.mock("@/lib/depix/receipt-url", () => ({
  extractDepixWithdrawReceiptUrl: () => null,
}));

import { handleEulenWithdrawWebhook } from "@/lib/webhooks/eulen-withdraw-handler";

const TENANT = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  for (const m of [findFirst, update, updateMany, recordWebhookEvent, markWebhookProcessed, onWithdrawCompleted]) m.mockReset();
  recordWebhookEvent.mockResolvedValue(true); // evento novo
  update.mockResolvedValue({});
  updateMany.mockResolvedValue({ count: 1 });
  markWebhookProcessed.mockResolvedValue(undefined);
});

describe("handleEulenWithdrawWebhook", () => {
  it("status sent -> COMPLETED + onWithdrawCompleted", async () => {
    findFirst.mockResolvedValue({ id: "tx-1", status: "PROCESSING", tenantId: TENANT });
    const res = await handleEulenWithdrawWebhook(
      { webhookType: "withdraw", id: "w_1", status: "sent", receiptUrl: "https://r" },
      null,
    );
    expect(res.status).toBe(200);
    const data = update.mock.calls[0]![0] as { data: { status: string } };
    expect(data.data.status).toBe("COMPLETED");
    expect(onWithdrawCompleted).toHaveBeenCalledWith(TENANT, "tx-1");
  });

  it("status error -> FAILED (sem onWithdrawCompleted)", async () => {
    findFirst.mockResolvedValue({ id: "tx-2", status: "PROCESSING", tenantId: TENANT });
    await handleEulenWithdrawWebhook({ webhookType: "withdraw", id: "w_2", status: "error" }, null);
    const data = update.mock.calls[0]![0] as { data: { status: string } };
    expect(data.data.status).toBe("FAILED");
    expect(onWithdrawCompleted).not.toHaveBeenCalled();
  });

  it("persiste o nome oficial do destinatario (receiverName) da Eulen", async () => {
    findFirst.mockResolvedValue({ id: "tx-r", status: "PROCESSING", tenantId: TENANT });
    await handleEulenWithdrawWebhook(
      { webhookType: "withdraw", id: "w_r", status: "sent", receiverName: "  Ana Lima  " },
      null,
    );
    const data = update.mock.calls[0]![0] as { data: { recipientName?: string } };
    expect(data.data.recipientName).toBe("Ana Lima"); // trim
  });

  it("sem receiverName -> NAO escreve recipientName (nao apaga o nome digitado)", async () => {
    findFirst.mockResolvedValue({ id: "tx-n", status: "PROCESSING", tenantId: TENANT });
    await handleEulenWithdrawWebhook({ webhookType: "withdraw", id: "w_n", status: "sent" }, null);
    const data = update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect("recipientName" in data.data).toBe(false);
  });

  it("receiverName da Eulen PREVALECE sobre o nome digitado pelo operador", async () => {
    // tx ja tem um nome (o operador digitou); a Eulen valida outro oficial.
    findFirst.mockResolvedValue({ id: "tx-p", status: "PROCESSING", tenantId: TENANT });
    await handleEulenWithdrawWebhook(
      { webhookType: "withdraw", id: "w_p", status: "sent", receiverName: "JOAO DA SILVA OFICIAL" },
      null,
    );
    const data = update.mock.calls[0]![0] as { data: { recipientName?: string } };
    expect(data.data.recipientName).toBe("JOAO DA SILVA OFICIAL");
  });

  it("status sending -> PROCESSING (nao terminal)", async () => {
    findFirst.mockResolvedValue({ id: "tx-3", status: "PROCESSING", tenantId: TENANT });
    await handleEulenWithdrawWebhook({ webhookType: "withdraw", id: "w_3", status: "sending" }, null);
    const data = update.mock.calls[0]![0] as { data: { status: string; completedAt?: unknown } };
    expect(data.data.status).toBe("PROCESSING");
    expect(data.data.completedAt).toBeUndefined();
  });

  it("evento duplicado -> 200 sem update", async () => {
    recordWebhookEvent.mockResolvedValue(false);
    const res = await handleEulenWithdrawWebhook({ webhookType: "withdraw", id: "w_1", status: "sent" }, null);
    expect(res.body).toMatchObject({ duplicate: true });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("tx ja terminal -> skip (nao reabre)", async () => {
    findFirst.mockResolvedValue({ id: "tx-4", status: "COMPLETED", tenantId: TENANT });
    const res = await handleEulenWithdrawWebhook({ webhookType: "withdraw", id: "w_4", status: "sent" }, null);
    expect(res.body).toMatchObject({ skipped: "already_terminal" });
    expect(update).not.toHaveBeenCalled();
  });

  it("status nao mapeado -> 200 skipped", async () => {
    const res = await handleEulenWithdrawWebhook({ webhookType: "withdraw", id: "w_5", status: "weird" }, null);
    expect(res.body).toMatchObject({ skipped: expect.stringContaining("weird") });
  });
});

/**
 * Auditoria 2026-08-05 (P0-A2). Os testes acima mockam `findFirst` para SEMPRE
 * devolver a transacao — entao passavam mesmo com o casamento quebrado. Estes
 * exercitam o `where` de verdade.
 *
 * O defeito: a Eulen devolve o id do saque SEM hifens na resposta de criacao
 * (`withdrawResult.id`, que gravamos em `pixpayDepixId`) e manda o MESMO id COM
 * hifens no webhook. A comparacao era string exata, entao os 83 webhooks de
 * saque entre 26/06 e 03/08 cairam TODOS em `not_found`: a confirmacao em tempo
 * real nunca funcionou e o status passou a depender so do cron de reconciliacao.
 *
 * Medido em producao: normalizando os hifens, 83/83 casam com uma transacao
 * existente — nenhum era saque de terceiro.
 */
describe("handleEulenWithdrawWebhook — casamento do id (P0-A2)", () => {
  /** Como a Eulen manda no webhook. */
  const ID_COM_HIFEN = "019fc800-315f-7616-9d11-239c33294ea6";
  /** Como gravamos, vindo de `withdrawResult.id` na criacao. */
  const ID_SEM_HIFEN = "019fc800315f76169d11239c33294ea6";

  /** So encontra a linha se o `where` procurar pela forma gravada no banco. */
  function bancoTemApenas(idGravado: string) {
    findFirst.mockImplementation((args: { where: { pixpayDepixId?: unknown } }) => {
      const cond = args.where.pixpayDepixId;
      const procurados =
        cond && typeof cond === "object" && "in" in cond
          ? (cond as { in: string[] }).in
          : [cond as string];
      return Promise.resolve(
        procurados.includes(idGravado)
          ? { id: "tx-h", status: "PROCESSING", tenantId: TENANT }
          : null,
      );
    });
  }

  it("webhook COM hifen casa com o saque gravado SEM hifen", async () => {
    bancoTemApenas(ID_SEM_HIFEN);
    const res = await handleEulenWithdrawWebhook(
      { webhookType: "withdraw", id: ID_COM_HIFEN, status: "sent" },
      null,
    );
    expect(res.body).toMatchObject({ matched: true, status: "COMPLETED" });
    // O efeito que nunca acontecia: liberar a reserva contabil do saque.
    expect(onWithdrawCompleted).toHaveBeenCalledWith(TENANT, "tx-h");
  });

  // Nao ha teste do caso inverso (webhook sem hifen x linha gravada com hifen)
  // porque ele nao existe: medido em producao, os 60 saques com
  // `pixpayDepixId` estao TODOS sem hifen — e sempre estarao, porque o valor vem
  // de `withdrawResult.id` da resposta de criacao. Reinserir hifens de UUID as
  // cegas seria normalizacao especulativa para um cenario que nao ocorre.
  it("webhook SEM hifen continua casando (formato ja igual ao gravado)", async () => {
    bancoTemApenas(ID_SEM_HIFEN);
    const res = await handleEulenWithdrawWebhook(
      { webhookType: "withdraw", id: ID_SEM_HIFEN, status: "sent" },
      null,
    );
    expect(res.body).toMatchObject({ matched: true, status: "COMPLETED" });
  });

  it("id que nao e nosso continua not_found (nao casa por acidente)", async () => {
    bancoTemApenas(ID_SEM_HIFEN);
    const res = await handleEulenWithdrawWebhook(
      { webhookType: "withdraw", id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", status: "sent" },
      null,
    );
    expect(res.body).toMatchObject({ matched: false });
    expect(markWebhookProcessed).toHaveBeenCalledWith(
      "eulen_withdraw",
      expect.any(String),
      expect.objectContaining({ ok: false, errorMessage: "not_found" }),
    );
    expect(onWithdrawCompleted).not.toHaveBeenCalled();
  });

  it("a chave de idempotencia usa o id CRU do webhook (nao muda o dedup)", async () => {
    bancoTemApenas(ID_SEM_HIFEN);
    await handleEulenWithdrawWebhook(
      { webhookType: "withdraw", id: ID_COM_HIFEN, status: "sent" },
      null,
    );
    expect(recordWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: `${ID_COM_HIFEN}:sent` }),
    );
  });
});
