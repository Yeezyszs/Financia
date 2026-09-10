/**
 * A marca de parcela que os bancos deixam na descrição.
 *
 * O servidor já lê isso na importação, para ligar a linha da fatura ao
 * parcelamento cadastrado. A tela precisa da mesma leitura antes de
 * qualquer ida ao servidor: é o que permite marcar "parcela 4/6" na
 * linha e oferecer o cadastro já preenchido a partir da própria compra —
 * que é onde a pessoa olha quando quer saber das parcelas.
 *
 * Fonte da verdade: `backend/src/domain/analysis/InstallmentTag.ts`. As
 * duas cópias são amarradas por um teste que compara os padrões, então
 * uma não pode mudar sem a outra.
 */
const PADROES = [
  /\bparcela\s+(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})\s*\)?\s*$/i,
  /\((\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})\)\s*$/,
  /\s[-–]\s(\d{1,2})\/(\d{1,2})\s*$/,
];

export interface Parcela {
  numero: number;
  total: number;
}

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

/**
 * A descrição sem a marca, para propor o nome do parcelamento. O traço
 * que sobra ("Aliexpress - ") sairia junto com a marca na cabeça de
 * quem lê, então sai aqui também.
 */
export function semMarca(description: string): string {
  for (const padrao of PADROES) {
    if (!padrao.test(description)) continue;
    return description
      .replace(padrao, '')
      .replace(/[\s\-–·|]+$/, '')
      .trim();
  }
  return description.trim();
}

/**
 * A data da primeira cobrança, contando para trás a partir desta.
 * Cadastrar pela parcela 4/6 precisa saber onde a compra começou — é o
 * que dá as datas das que ainda vêm.
 */
export function primeiraCobranca(occurredOn: string, numero: number): string {
  const [ano, mes, dia] = occurredOn.split('-').map(Number);
  const alvo = new Date(Date.UTC(ano!, mes! - 1 - (numero - 1), 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia!, ultimo));
  return alvo.toISOString().slice(0, 10);
}
