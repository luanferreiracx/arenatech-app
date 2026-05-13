/**
 * Converts a monetary value to its Portuguese written form.
 * Faithful replica of the Laravel OrdemServicoPdfController::valorPorExtenso.
 */

function numeroParaExtenso(numero: number): string {
  const unidades = ["", "um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const dezADezenove = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  if (numero === 0) return "zero";
  if (numero === 100) return "cem";

  let resultado = "";
  let n = numero;

  if (n >= 1000) {
    const milhar = Math.floor(n / 1000);
    if (milhar === 1) {
      resultado += "mil";
    } else {
      resultado += numeroParaExtenso(milhar) + " mil";
    }
    n %= 1000;
    if (n > 0) resultado += " e ";
  }

  if (n >= 100) {
    resultado += centenas[Math.floor(n / 100)];
    n %= 100;
    if (n > 0) resultado += " e ";
  }

  if (n >= 10 && n <= 19) {
    resultado += dezADezenove[n - 10]!;
  } else if (n >= 20) {
    resultado += dezenas[Math.floor(n / 10)];
    n %= 10;
    if (n > 0) resultado += " e " + unidades[n];
  } else if (n > 0) {
    resultado += unidades[n];
  }

  return resultado;
}

export function valorPorExtenso(valor: number): string {
  const formatted = valor.toFixed(2);
  const parts = formatted.split(".");
  const inteiro = parseInt(parts[0]!, 10);
  const centavos = parseInt(parts[1]!, 10);

  let extenso = numeroParaExtenso(inteiro);
  extenso += inteiro === 1 ? " real" : " reais";

  if (centavos > 0) {
    extenso += " e " + numeroParaExtenso(centavos);
    extenso += centavos === 1 ? " centavo" : " centavos";
  }

  return extenso;
}
