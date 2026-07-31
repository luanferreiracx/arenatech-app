/**
 * Regras que impedem um saque DePix de ser enviado duas vezes por acidente.
 *
 * Contexto (dois incidentes de producao, o segundo em 2026-07-31): ao sacar, o
 * operador viu um erro, fechou a janela e abriu de novo. O botao verde voltou
 * armado — e o saque tinha saido. Na segunda vez ele so nao pagou em dobro
 * porque desconfiou e nao clicou.
 *
 * Duas coisas falharam, e as duas moram aqui:
 *
 * 1. A chave de idempotencia vivia enquanto a tela estivesse montada. Fechar e
 *    reabrir cunhava outra, e a deduplicacao do servidor — que a documentacao do
 *    servico promete — nunca chegava a valer.
 * 2. O erro era tratado como "nao saiu". Num timeout, a resposta honesta e
 *    "nao sei": o pedido pode ter chegado.
 *
 * Estao num modulo separado da tela porque sao *decisoes*, nao renderizacao, e
 * porque decisao sobre dinheiro precisa de teste.
 */

/**
 * Erros em que o saque com CERTEZA nao saiu: o servidor recusou uma regra de
 * negocio antes de tocar em dinheiro. So nestes e seguro re-armar o botao.
 *
 * Qualquer outra coisa — timeout, queda de rede, 5xx, resposta sem codigo —
 * deixa o estado INDETERMINADO.
 */
const ERROS_QUE_NAO_MOVERAM_DINHEIRO = new Set([
  "BAD_REQUEST",
  "CONFLICT",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "PRECONDITION_FAILED",
  "TOO_MANY_REQUESTS",
  "NOT_FOUND",
]);

/**
 * O saque pode ter saido? Na duvida, sim — e a UI tem que dizer isso em vez de
 * oferecer o botao de novo. Default seguro: desconhecido conta como incerto.
 */
export function resultadoEhIndeterminado(codigoDeErro: string | null | undefined): boolean {
  return !ERROS_QUE_NAO_MOVERAM_DINHEIRO.has(codigoDeErro ?? "");
}

/**
 * A deduplicacao do servidor devolve o registro que ja existe para aquela chave
 * — inclusive quando ele nasceu FALHO (a Eulen recusou por limite diario,
 * compliance, chave invalida). Com a chave agora estavel, isso passou a ser
 * alcancavel: sem esta checagem, o cliente celebraria "Saque enviado!" e
 * levaria o operador a um saque que nunca saiu.
 *
 * Quando a resposta e um saque falho, a tentativa esta morta: a chave tem que
 * ser descartada para que um novo clique seja uma tentativa de verdade.
 */
export function respostaEhTentativaMorta(status: string): boolean {
  return status === "FAILED" || status === "CANCELLED" || status === "EXPIRED";
}

export type IntencaoDeSaque = {
  pixKey: string;
  recipientTaxId: string;
  netAmountCents: number;
};

/**
 * Identidade da intencao: mesmo destino + mesmo valor = mesma intencao, mesmo
 * que o operador tenha digitado com mascara diferente ou remontado a tela.
 */
export function chaveDaIntencao(intencao: IntencaoDeSaque): string {
  const destino = intencao.pixKey.replace(/\D/g, "") || intencao.pixKey.trim().toLowerCase();
  const documento = intencao.recipientTaxId.replace(/\D/g, "");
  return `depix-withdraw:${destino}:${documento}:${intencao.netAmountCents}`;
}

/** Subconjunto de `Storage` que usamos — facilita testar sem browser. */
export type ArmazenamentoDeChave = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Chave de idempotencia estavel para uma intencao, sobrevivendo a remontagem da
 * tela. A mesma intencao reenviada devolve o saque que ja existe em vez de
 * criar um segundo.
 */
export function idempotencyKeyDaIntencao(
  storage: ArmazenamentoDeChave,
  intencao: IntencaoDeSaque,
  gerarId: () => string = () => crypto.randomUUID(),
): string {
  const chave = chaveDaIntencao(intencao);
  const guardada = storage.getItem(chave);
  if (guardada) return guardada;
  const nova = gerarId();
  storage.setItem(chave, nova);
  return nova;
}

/**
 * Intencao concluida. Descarta a chave para que um proximo saque *deliberado*
 * ao mesmo destino nao seja deduplicado por engano — quem barra repeticao
 * acidental depois disso e a guarda do servidor, que recusa nomeando a
 * transacao anterior.
 */
export function descartarChaveDaIntencao(
  storage: ArmazenamentoDeChave,
  intencao: IntencaoDeSaque,
): void {
  storage.removeItem(chaveDaIntencao(intencao));
}
