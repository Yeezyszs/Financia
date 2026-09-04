import { describe, expect, it } from 'vitest';
import { StatementCsvParser } from '../../../src/infrastructure/parsers/csv/StatementCsvParser.js';
import { C6_CARTAO, C6_CONTA } from '../../../src/infrastructure/parsers/layouts/index.js';

/**
 * Layout de fatura do C6: separador ponto e vírgula, decimal com vírgula,
 * data dd/mm/aaaa, coluna de parcela, e o valor em dólar ao lado do valor
 * em real quando houve conversão.
 */
const FATURA = `Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)
05/08/2026;PEDRO M;1234;Serviços;NETFLIX.COM;2/12;0,00;0,00;55,90
08/08/2026;PEDRO M;1234;Alimentação;IFOOD *RESTAURANTE;Única;0,00;0,00;64,90
12/08/2026;PEDRO M;1234;Compras;AMAZON US;-;9,99;5,19;51,85
20/08/2026;PEDRO M;1234;Pagamentos;PAGAMENTO EM 20/08;-;0,00;0,00;-2350,90
`;

const EXTRATO = `Data Lançamento;Descrição;Valor;Saldo
01/08/2026;TRANSFERENCIA RECEBIDA - SALARIO;8500,00;9200,00
03/08/2026;COMPRA CARTAO DEBITO - PADARIA;-18,50;9181,50
10/08/2026;PAGAMENTO DE FATURA CARTAO C6;-2350,90;6830,60
`;

describe('fatura do C6', () => {
  const parser = new StatementCsvParser(C6_CARTAO);

  it('reconhece o layout', () => {
    expect(parser.supports(FATURA)).toBe(true);
  });

  it('inverte o sinal: compra cobrada vira saída', () => {
    const { rows } = parser.parse(FATURA);

    expect(rows[0]).toMatchObject({ occurredOn: '2026-08-05', amountCents: -5590 });
    // pagamento da fatura vem negativo na cobrança, então entra positivo
    expect(rows[3]?.amountCents).toBe(235090);
  });

  it('usa o valor em reais, nunca o em dólar', () => {
    const { rows } = parser.parse(FATURA);

    // a compra internacional custou US$ 9,99 e R$ 51,85
    expect(rows[2]?.amountCents).toBe(-5185);
    expect(rows[2]?.raw?.valorEmDolar).toBe('9,99');
  });

  it('anexa a parcela à descrição, e ignora "Única"', () => {
    const { rows } = parser.parse(FATURA);

    expect(rows[0]?.description).toBe('NETFLIX.COM (2/12)');
    expect(rows[1]?.description).toBe('IFOOD *RESTAURANTE');
    expect(rows[2]?.description).toBe('AMAZON US');
  });

  it('guarda cartão e categoria do banco para auditoria', () => {
    const { rows } = parser.parse(FATURA);

    expect(rows[0]?.raw).toMatchObject({ cartao: '1234', categoriaDoBanco: 'Serviços' });
  });

  it('lê o período a partir das datas', () => {
    const { periodStart, periodEnd } = parser.parse(FATURA);

    expect(periodStart).toBe('2026-08-05');
    expect(periodEnd).toBe('2026-08-20');
  });

  it('recusa um CSV que não é fatura em vez de importar lixo', () => {
    expect(() => parser.parse('coluna_a;coluna_b\n1;2')).toThrow(/não parece uma fatura do C6/i);
  });

  it('recusa fatura sem a coluna em reais, em vez de importar dólar', () => {
    const soDolar = `Data de Compra;Descrição;Valor (em US$)
05/08/2026;NETFLIX;9,99
`;
    expect(() => parser.parse(soDolar)).toThrow(/não parece uma fatura do C6/i);
  });
});

describe('extrato do C6', () => {
  const parser = new StatementCsvParser(C6_CONTA);

  it('preserva o sinal do extrato', () => {
    const { rows } = parser.parse(EXTRATO);

    expect(rows[0]).toMatchObject({
      description: 'TRANSFERENCIA RECEBIDA - SALARIO',
      amountCents: 850000,
    });
    expect(rows[1]?.amountCents).toBe(-1850);
  });

  it('guarda o saldo da linha para auditoria', () => {
    const { rows } = parser.parse(EXTRATO);
    expect(rows[0]?.raw?.saldo).toBe('9200,00');
  });

  it('lê ponto e vírgula como separador', () => {
    const { rows } = parser.parse(EXTRATO);
    expect(rows).toHaveLength(3);
  });
});
