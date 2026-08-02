/**
 * Quais carteiras checar nesta rodada do detector de cache, e com qual orçamento.
 *
 * Mora isolado e puro porque governa uma pergunta de segurança operacional que
 * não dá para responder olhando o código da coleta: **toda carteira acaba sendo
 * checada, ou existem carteiras que nunca são?**
 *
 * O detector consulta a Esplora pública uma vez por outpoint, espaçado, e as
 * públicas rate-limitam rajada. Com uma carteira só (a central), bastava um teto
 * fixo. Com N clientes, um teto fixo aplicado sempre na mesma ordem significa
 * que as primeiras carteiras consomem o orçamento inteiro e as últimas nunca são
 * olhadas — o cache delas apodrece sem detector, que é exatamente o estado em
 * que a carteira espelho do NO-KYC ficou divergindo R$ 2.362 da central sem
 * ninguém ver.
 *
 * Por isso a rodada é um ANEL: cada execução começa uma posição adiante. Quem
 * sobrou hoje é o primeiro amanhã. O que não coube volta em `skipped` para ser
 * logado — corte silencioso lê como "checamos tudo" quando não checamos.
 */

/** Uma carteira selecionada e quantos outpoints ela pode gastar nesta rodada. */
export type WalletCacheCheck = {
  tenantId: string;
  maxOutpoints: number;
};

/**
 * Amostra mínima que ainda diz alguma coisa.
 *
 * O detector exige ≥ 3 UTXOs gastos E fração ≥ 25% para alertar. Com menos de 4
 * outpoints é impossível bater os dois limiares ao mesmo tempo, então uma cota
 * menor que isso gastaria Esplora para produzir um "não sei" garantido. Melhor
 * deixar a carteira para a próxima rodada, com cota inteira.
 */
export const MIN_USEFUL_SAMPLE = 4;

export type CacheIntegrityPlan = {
  checks: WalletCacheCheck[];
  /** Carteiras que não couberam nesta rodada (entram na próxima pelo anel). */
  skipped: string[];
};

/**
 * Distribui o orçamento de outpoints entre as carteiras, começando em
 * `runIndex % total` para rotacionar a cobertura entre execuções.
 *
 * `tenantIds` precisa vir em ordem ESTÁVEL (ordene por id no chamador): o anel
 * só cobre todo mundo se a posição de cada carteira não mudar de rodada para
 * rodada.
 */
export function planCacheIntegrityRun(args: {
  tenantIds: string[];
  runIndex: number;
  totalOutpointBudget: number;
  maxOutpointsPerWallet: number;
}): CacheIntegrityPlan {
  const { tenantIds, runIndex, totalOutpointBudget, maxOutpointsPerWallet } = args;
  if (tenantIds.length === 0) return { checks: [], skipped: [] };

  // O passo do anel é a CAPACIDADE da rodada, não 1.
  //
  // Com passo 1 as janelas se sobrepõem: uma rodada que cobre 2 carteiras
  // começando em 0 checa {0,1}; a seguinte começa em 1 e checa {1,2} — a
  // carteira 1 é checada duas vezes seguidas enquanto a 9 espera. Medido: 5
  // rodadas cobriam 6 de 10 carteiras em vez de todas. Avançando pela
  // capacidade, as janelas ladrilham o anel e a cobertura fecha no menor número
  // de rodadas possível.
  const capacity = Math.max(1, Math.floor(totalOutpointBudget / maxOutpointsPerWallet));
  const start = (((runIndex * capacity) % tenantIds.length) + tenantIds.length) % tenantIds.length;
  const checks: WalletCacheCheck[] = [];
  const skipped: string[] = [];
  let remaining = totalOutpointBudget;

  for (let step = 0; step < tenantIds.length; step += 1) {
    const tenantId = tenantIds[(start + step) % tenantIds.length]!;
    const allowance = Math.min(maxOutpointsPerWallet, remaining);
    if (allowance < MIN_USEFUL_SAMPLE) {
      skipped.push(tenantId);
      continue;
    }
    checks.push({ tenantId, maxOutpoints: allowance });
    remaining -= allowance;
  }

  return { checks, skipped };
}
