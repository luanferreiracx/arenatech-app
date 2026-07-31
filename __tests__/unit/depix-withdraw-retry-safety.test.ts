/**
 * SQ-1 — as duas decisões do cliente que deixavam um saque sair duas vezes.
 *
 * Incidente (2ª ocorrência, relatada pelo dono em 2026-07-31): ao sacar, ele viu
 * um erro, fechou a janela e abriu de novo. O botão verde voltou armado — e o
 * saque tinha saído. Só não pagou em dobro porque desconfiou e não clicou.
 *
 * Falha 1: a chave de idempotência era `useMemo(() => crypto.randomUUID(), [])`.
 * Vivia enquanto a tela estivesse montada. Fechar e reabrir cunhava outra, e a
 * deduplicação do servidor — que o serviço documenta como garantia — nunca
 * chegava a valer. A proteção evaporava exatamente no gesto de quem ficou na
 * dúvida se o saque saiu, que é quando ela mais importa.
 *
 * Falha 2: `onError` tratava qualquer erro como "não saiu". Num timeout a
 * resposta honesta é "não sei".
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  chaveDaIntencao,
  descartarChaveDaIntencao,
  idempotencyKeyDaIntencao,
  respostaEhTentativaMorta,
  resultadoEhIndeterminado,
  type ArmazenamentoDeChave,
} from "@/lib/depix/withdraw-retry-safety";

/** sessionStorage de mentira — o de verdade sobrevive à remontagem, e é esse o ponto. */
function armazenamentoFalso(): ArmazenamentoDeChave & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
    removeItem: (k) => void dados.delete(k),
  };
}

const INTENCAO = {
  pixKey: "(11) 99988-7766",
  recipientTaxId: "529.982.247-25",
  netAmountCents: 25_000,
};

let storage: ReturnType<typeof armazenamentoFalso>;
let contador: number;
const gerarId = () => `uuid-${++contador}`;

beforeEach(() => {
  storage = armazenamentoFalso();
  contador = 0;
});

describe("chave de idempotência sobrevive à remontagem da tela", () => {
  it("fechar e reabrir a janela reenvia a MESMA chave", () => {
    // Primeira montagem: o operador manda o saque.
    const primeira = idempotencyKeyDaIntencao(storage, INTENCAO, gerarId);
    // Timeout. Ele fecha a janela e abre de novo — componente remontado.
    const segunda = idempotencyKeyDaIntencao(storage, INTENCAO, gerarId);

    expect(segunda).toBe(primeira);
    expect(contador, "não pode cunhar uma chave nova para a mesma intenção").toBe(1);
  });

  it("a máscara digitada não muda a identidade da intenção", () => {
    const comMascara = idempotencyKeyDaIntencao(storage, INTENCAO, gerarId);
    const semMascara = idempotencyKeyDaIntencao(
      storage,
      { pixKey: "11999887766", recipientTaxId: "52998224725", netAmountCents: 25_000 },
      gerarId,
    );

    expect(semMascara).toBe(comMascara);
  });

  it("chave PIX aleatória/e-mail também tem identidade estável", () => {
    // Sem dígitos, cai no texto normalizado — senão toda chave de e-mail
    // colapsaria numa só e saques a destinos diferentes seriam deduplicados.
    const a = chaveDaIntencao({ ...INTENCAO, pixKey: "Fulano@Loja.com" });
    const b = chaveDaIntencao({ ...INTENCAO, pixKey: "fulano@loja.com " });
    const c = chaveDaIntencao({ ...INTENCAO, pixKey: "outro@loja.com" });

    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it("valor diferente é outra intenção", () => {
    const vinteECinco = idempotencyKeyDaIntencao(storage, INTENCAO, gerarId);
    const cinquenta = idempotencyKeyDaIntencao(
      storage,
      { ...INTENCAO, netAmountCents: 50_000 },
      gerarId,
    );

    expect(cinquenta).not.toBe(vinteECinco);
  });

  it("destinatário diferente é outra intenção", () => {
    const um = idempotencyKeyDaIntencao(storage, INTENCAO, gerarId);
    const outro = idempotencyKeyDaIntencao(
      storage,
      { ...INTENCAO, pixKey: "(11) 90000-0000" },
      gerarId,
    );

    expect(outro).not.toBe(um);
  });

  it("depois do saque concluído, um segundo saque deliberado ganha chave nova", () => {
    // Senão o operador ficaria impedido de pagar duas vezes a mesma pessoa —
    // quem barra a repetição ACIDENTAL a partir daqui é a guarda do servidor,
    // que recusa nomeando a transação anterior em vez de deduplicar em silêncio.
    const primeiro = idempotencyKeyDaIntencao(storage, INTENCAO, gerarId);
    descartarChaveDaIntencao(storage, INTENCAO);
    const segundo = idempotencyKeyDaIntencao(storage, INTENCAO, gerarId);

    expect(segundo).not.toBe(primeiro);
  });
});

describe("erro do saque: 'o dinheiro saiu?' e não 'deu erro?'", () => {
  it("timeout, queda de rede e 5xx deixam o estado INDETERMINADO", () => {
    // Estes são os casos do incidente: o pedido pode ter chegado.
    expect(resultadoEhIndeterminado(undefined)).toBe(true);
    expect(resultadoEhIndeterminado(null)).toBe(true);
    expect(resultadoEhIndeterminado("INTERNAL_SERVER_ERROR")).toBe(true);
    expect(resultadoEhIndeterminado("TIMEOUT")).toBe(true);
    expect(resultadoEhIndeterminado("CLIENT_CLOSED_REQUEST")).toBe(true);
  });

  it("código desconhecido conta como incerto — o default é o seguro", () => {
    expect(resultadoEhIndeterminado("ALGO_QUE_AINDA_NAO_EXISTE")).toBe(true);
  });

  it("recusa de regra de negócio é determinada: o saque não saiu", () => {
    // Aqui o servidor respondeu antes de tocar em dinheiro, então re-armar o
    // formulário é seguro e não travar o operador é o certo.
    expect(resultadoEhIndeterminado("BAD_REQUEST")).toBe(false);
    expect(resultadoEhIndeterminado("CONFLICT")).toBe(false);
    expect(resultadoEhIndeterminado("FORBIDDEN")).toBe(false);
    expect(resultadoEhIndeterminado("UNAUTHORIZED")).toBe(false);
    expect(resultadoEhIndeterminado("PRECONDITION_FAILED")).toBe(false);
    expect(resultadoEhIndeterminado("TOO_MANY_REQUESTS")).toBe(false);
  });
});

describe("resposta da dedupe: nem todo registro devolvido e um saque vivo", () => {
  it("um saque FALHO devolvido pela dedupe nao pode virar 'Saque enviado!'", () => {
    // Com a chave agora estavel, este caminho passou a ser alcancavel: a Eulen
    // recusa (limite diario, compliance), o registro nasce FAILED, e o reenvio
    // da mesma intencao devolve justamente ele.
    expect(respostaEhTentativaMorta("FAILED")).toBe(true);
    expect(respostaEhTentativaMorta("CANCELLED")).toBe(true);
    expect(respostaEhTentativaMorta("EXPIRED")).toBe(true);
  });

  it("saque vivo ou concluido e sucesso de verdade", () => {
    expect(respostaEhTentativaMorta("PENDING")).toBe(false);
    expect(respostaEhTentativaMorta("PROCESSING")).toBe(false);
    expect(respostaEhTentativaMorta("COMPLETED")).toBe(false);
  });
});
