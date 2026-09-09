/**
 * A marca de parcela que os bancos deixam na descrição.
 *
 * Não há campo estruturado para isso em fatura nenhuma: o que existe é
 * um "4/6" grudado no texto, em meia dúzia de formatos diferentes.
 * Extraí-lo é o que permite ligar uma linha da fatura à compra parcelada
 * que a originou — e é a única informação sobre o futuro que o extrato
 * carrega, porque "Parcela 4/6" diz que faltam duas.
 */
export interface Parcela {
  numero: number;
  total: number;
}

/**
 * Formatos vistos nos extratos reais: "Parcela 4/6", "- 3/3", "(2 de 4)"
 * e a variante do C6, que o parser anexa entre parênteses.
 *
 * O casamento é ancorado no fim da string de propósito. Descrição de
 * fatura tem número no meio o tempo todo — "Posto 24/7", "Loja 1/2 Preço"
 * — e a parcela, quando existe, vem sempre no fim.
 */
const PADROES = [
  /\bparcela\s+(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})\s*\)?\s*$/i,
  /\((\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})\)\s*$/,
  /\s[-–]\s(\d{1,2})\/(\d{1,2})\s*$/,
];

export function lerParcela(description: string): Parcela | null {
  for (const padrao of PADROES) {
    const achado = padrao.exec(description);
    if (!achado) continue;

    const numero = Number(achado[1]);
    const total = Number(achado[2]);

    // "12/24" com número maior que o total não é parcela — é data, código
    // ou qualquer outra coisa que caiu no formato.
    if (numero < 1 || total < 2 || numero > total) continue;

    return { numero, total };
  }

  return null;
}
