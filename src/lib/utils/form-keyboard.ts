/**
 * Leitores de codigo de barras digitam o codigo e emitem um Enter no fim.
 * Num <form> HTML, Enter dentro de um <input> de linha unica dispara o submit
 * default — entao passar o leitor num campo salvava o formulario pela metade.
 *
 * Esta funcao decide se o Enter deve ser bloqueado: bloqueia quando vem de um
 * input de linha unica; deixa passar em <textarea> (quebra de linha legitima) e
 * no botao de submit (acao explicita do usuario).
 */
export function shouldBlockEnterSubmit(params: {
  key: string;
  tagName: string;
  /** type do elemento alvo (ex: "submit", "text") — relevante para <button>. */
  type?: string;
}): boolean {
  if (params.key !== "Enter") return false;
  const tag = params.tagName.toUpperCase();
  if (tag === "TEXTAREA") return false;
  if (tag === "BUTTON" || params.type === "submit") return false;
  return true;
}
