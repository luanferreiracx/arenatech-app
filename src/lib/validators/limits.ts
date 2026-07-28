/**
 * Tetos de tamanho para entrada de texto. Auditoria 2026-07-25, item 24.
 *
 * ## Por que isto existe
 *
 * 505 das 542 colunas de texto do schema são `TEXT` puro — o Postgres aceita
 * até 1GB por valor. Um `z.string()` sem `.max()` sobre uma dessas colunas é
 * armazenamento gratuito para quem tiver uma sessão válida (ou um token de
 * integração vazado). Medido em 2026-07-28: `customers.notes` engoliu **20 MB
 * numa única requisição, em 185ms**, persistidos e lidos de volta. O disco
 * enche, o backup cresce junto, o dump fica lento — e nada nos logs denuncia,
 * porque não é o dado que é hostil, é o tamanho.
 *
 * ## O que a medição DESMENTIU
 *
 * O achado original dizia "campos de busca que alimentam `contains`". Não é.
 * `contains` com 1.000.000 de caracteres roda em **37ms** e devolve 0 linhas —
 * o Postgres descarta pelo comprimento antes de comparar. E `dateFrom`/`dateTo`
 * viram `Invalid Date`, que o Prisma rejeita com erro de argumento. Busca e
 * data ganham teto aqui por higiene (payload de rede, log limpo), não porque
 * eram vetor de DoS.
 *
 * ## Escala
 *
 * Os valores são generosos de propósito: o teto existe para barrar o absurdo,
 * não para brigar com o uso real. Um técnico descrevendo um reparo complexo
 * cabe folgado em 5.000 caracteres; 5 MB não é uso, é abuso.
 */

/** Nome próprio, título, rótulo. Espelha o `varchar(255)` do schema. */
export const MAX_NOME = 255

/** Linha de endereço, categoria, modelo de aparelho. */
export const MAX_LINHA = 255

/** Termo de busca. Acima disto não é busca — nenhum dado indexado é tão longo. */
export const MAX_BUSCA = 200

/** Data em string (ISO ou `YYYY-MM-DD`). O maior ISO com timezone tem 29. */
export const MAX_DATA = 40

/** Observação, descrição, motivo — o texto livre do dia a dia. */
export const MAX_TEXTO = 2_000

/**
 * Texto longo de verdade: laudo técnico, política de garantia, termos de uso.
 * O maior conteúdo legítimo hoje em produção não passa de alguns milhares.
 */
export const MAX_TEXTO_LONGO = 20_000

/**
 * Payload base64 de certificado A1 (.pfx). Um certificado real tem 2–8 KB;
 * em base64, ~11 KB. 512 KB dá três ordens de grandeza de folga e ainda evita
 * que 5 MB cheguem ao `Buffer.from` + parser ASN.1 + criptografia.
 */
export const MAX_PFX_BASE64 = 512 * 1024

/**
 * XML de NF-e importado. Uma nota com centenas de itens fica na casa das
 * centenas de KB; 4 MB cobre o pior caso real com folga.
 */
export const MAX_XML = 4 * 1024 * 1024

/**
 * Senha / passphrase / código de verificação. O teto aqui protege CPU: sem ele,
 * um payload gigante vira trabalho de hash (bcrypt/scrypt) antes de qualquer
 * decisão sobre a credencial.
 */
export const MAX_SENHA = 200
