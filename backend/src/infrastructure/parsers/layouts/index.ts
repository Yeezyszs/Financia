import type { StatementLayout } from '../csv/StatementCsvParser.js';

/**
 * Layouts de extrato e fatura, um por banco e tipo de conta.
 *
 * O que muda entre eles é nome de coluna e convenção de sinal. A lógica
 * de leitura é a mesma e vive em StatementCsvParser.
 */

const DATA = ['date', 'data', 'data lancamento', 'data de compra', 'data da compra'];
const DESCRICAO = [
  'title',
  'descricao',
  'description',
  'historico',
  'titulo',
  'estabelecimento',
  'lancamento',
];

export const NUBANK_CONTA: StatementLayout = {
  institution: 'nubank',
  accountType: 'checking',
  label: 'um extrato do Nubank',
  dateColumns: DATA,
  descriptionColumns: DESCRICAO,
  amountColumns: ['amount', 'valor'],
  // O identificador, quando existe, fica só para auditoria: nem todo
  // export do Nubank traz, e o dedupe precisa da mesma chave nos dois.
  extraColumns: { identifier: ['identificador', 'identifier', 'id'] },
};

export const NUBANK_CARTAO: StatementLayout = {
  institution: 'nubank',
  accountType: 'credit_card',
  label: 'uma fatura do Nubank',
  dateColumns: DATA,
  descriptionColumns: DESCRICAO,
  amountColumns: ['amount', 'valor'],
  invertSign: true,
};

export const C6_CONTA: StatementLayout = {
  institution: 'c6',
  accountType: 'checking',
  label: 'um extrato do C6',
  dateColumns: [...DATA, 'data do lancamento', 'data movimentacao'],
  descriptionColumns: [...DESCRICAO, 'descricao do lancamento', 'historico do lancamento'],
  amountColumns: ['valor em r', 'valor r', 'valor', 'amount'],
  extraColumns: {
    saldo: ['saldo', 'saldo em r'],
    tipo: ['tipo', 'tipo de lancamento', 'tipo lancamento'],
  },
};

export const C6_CARTAO: StatementLayout = {
  institution: 'c6',
  accountType: 'credit_card',
  label: 'uma fatura do C6',
  dateColumns: [...DATA, 'data da transacao'],
  descriptionColumns: [...DESCRICAO, 'descricao da compra'],
  // "valor em r" antes de "valor": a fatura do C6 traz a compra em dólar
  // ao lado da compra em real quando houve conversão.
  amountColumns: ['valor em r', 'valor r', 'valor brl', 'valor', 'amount'],
  invertSign: true,
  installmentColumns: ['parcela', 'parcelas', 'numero da parcela'],
  extraColumns: {
    cartao: ['final do cartao', 'cartao', 'nome no cartao'],
    categoriaDoBanco: ['categoria'],
    valorEmDolar: ['valor em us', 'valor us'],
  },
};

export const LAYOUTS: StatementLayout[] = [NUBANK_CONTA, NUBANK_CARTAO, C6_CONTA, C6_CARTAO];
