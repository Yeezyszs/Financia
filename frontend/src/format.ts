const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Centavos -> "R$ 1.234,56". O domínio guarda centavos; a UI formata. */
export function money(cents: number): string {
  return brl.format(cents / 100);
}

/** Versão curta para eixo de gráfico: "R$ 8,5 mil". */
export function moneyShort(cents: number): string {
  return brlCompact.format(cents / 100);
}

/** "2026-08-21" -> "21/08/2026", sem passar por fuso horário. */
export function date(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const MONTH_NAMES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** "2026-08" -> "ago" */
export function monthLabel(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return MONTH_NAMES[index] ?? month;
}

/**
 * "2026-08" -> "Agosto de 2026". O nome por extenso é para onde a pessoa
 * escolhe um mês; a abreviação serve a eixo de gráfico, onde não cabe.
 */
export function monthName(month: string): string {
  const [ano, mes] = month.split('-').map(Number);
  const data = new Date(Date.UTC(ano ?? 0, (mes ?? 1) - 1, 1));
  const nome = data.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${ano}`;
}

export function monthLabelLong(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return `${MONTH_NAMES[index] ?? month}/${month.slice(0, 4)}`;
}

/** Primeiro e último dia de um mês, no formato que a API espera. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

/**
 * Primeiro dia do mês que está `meses` atrás — o começo da janela de
 * análise. Vai por `Date.UTC` para não escorregar um dia quando o fuso
 * do navegador está atrás de Greenwich.
 */
export function monthsBefore(year: number, month: number, meses: number): string {
  const inicio = new Date(Date.UTC(year, month - 1 - meses, 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${inicio.getUTCFullYear()}-${pad(inicio.getUTCMonth() + 1)}-01`;
}

/**
 * Os últimos `quantidade` meses, do mais recente para o mais antigo, no
 * formato YYYY-MM. Serve para o seletor de mês da listagem.
 */
export function ultimosMeses(quantidade: number, hoje = new Date()): string[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: quantidade }, (_, i) => {
    const data = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1));
    return `${data.getUTCFullYear()}-${pad(data.getUTCMonth() + 1)}`;
  });
}

/** Primeiro e último dia de um mês YYYY-MM. */
export function boundsOfMonth(month: string): { from: string; to: string } {
  const [ano, mes] = month.split('-').map(Number);
  return monthRange(ano ?? 0, mes ?? 1);
}

/**
 * O mês que um intervalo representa, ou `null` quando ele não é
 * exatamente um mês. É assim que o seletor sabe se deve mostrar "Agosto"
 * ou "Personalizado" depois de um recorte vindo de outra tela.
 */
export function monthOfRange(from: string, to: string): string | null {
  if (!from || !to) return null;
  const mes = from.slice(0, 7);
  if (to.slice(0, 7) !== mes) return null;

  const limites = boundsOfMonth(mes);
  return limites.from === from && limites.to === to ? mes : null;
}
