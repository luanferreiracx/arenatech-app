/**
 * Versão vigente dos documentos legais.
 *
 * Existe porque o aceite precisa dizer **o que** foi aceito. Guardar só um
 * booleano ("aceitou") responde à pergunta errada: quando os Termos mudarem,
 * ninguém consegue distinguir quem concordou com a versão nova de quem concordou
 * com uma redação de meses atrás — e é exatamente essa distinção que um aceite
 * serve para provar.
 *
 * Formato `AAAA-MM-DD`: ordenável como string, legível por humano, e casa com a
 * data que as próprias páginas exibem. Sem semver, porque documento legal não
 * tem "patch": ou o texto mudou (e o aceite anterior virou histórico), ou não.
 *
 * **Ao editar qualquer documento em `/legal`, mude esta constante.** Um teste
 * confere que a data exibida nas páginas bate com ela — não dá para atualizar o
 * texto e esquecer a versão.
 */
export const CURRENT_TERMS_VERSION = "2026-07-07";

/** A mesma data por extenso, como as páginas legais exibem. */
export const CURRENT_TERMS_LABEL = "07 de julho de 2026";
