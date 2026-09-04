import { describe, expect, it } from 'vitest';
import { StatementCsvParser } from '../../../src/infrastructure/parsers/csv/StatementCsvParser.js';
import { NUBANK_CARTAO, NUBANK_CONTA } from '../../../src/infrastructure/parsers/layouts/index.js';
import { EXTRATO_BR, EXTRATO_ISO, FATURA } from '../../fixtures/nubank.js';

describe('NubankCheckingParser', () => {
  const parser = new StatementCsvParser(NUBANK_CONTA);

  it('lê o layout date,title,amount preservando o sinal', () => {
    const { rows, periodStart, periodEnd } = parser.parse(EXTRATO_ISO);

    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      occurredOn: '2026-08-01',
      description: 'Transferência recebida - SALARIO EMPRESA LTDA',
      amountCents: 850000,
    });
    expect(rows[1]?.amountCents).toBe(-1850);
    expect(periodStart).toBe('2026-08-01');
    expect(periodEnd).toBe('2026-08-04');
  });

  it('lê o layout em português com data dd/mm/aaaa e valor com milhar', () => {
    const { rows } = parser.parse(EXTRATO_BR);

    expect(rows[0]).toMatchObject({ occurredOn: '2026-08-01', amountCents: 850000 });
    expect(rows[1]?.amountCents).toBe(-1850);
    // identificador é preservado para auditoria, não usado no dedupe
    expect(rows[0]?.raw?.identifier).toBe('6a1f-abc');
  });

  it('reconhece os dois layouts', () => {
    expect(parser.supports(EXTRATO_ISO)).toBe(true);
    expect(parser.supports(EXTRATO_BR)).toBe(true);
    expect(parser.supports('foo,bar\n1,2')).toBe(false);
  });

  it('recusa CSV de outro formato em vez de importar lixo', () => {
    expect(() => parser.parse('coluna_a,coluna_b\n1,2')).toThrow(/não parece um extrato/i);
  });

  it('recusa data em formato desconhecido', () => {
    expect(() => parser.parse('date,title,amount\nagosto de 2026,Teste,-10.00')).toThrow(
      /formato não reconhecido/i,
    );
  });
});

describe('NubankCreditCardParser', () => {
  const parser = new StatementCsvParser(NUBANK_CARTAO);

  it('inverte o sinal: compra na fatura vira saída', () => {
    const { rows } = parser.parse(FATURA);

    expect(rows[0]).toMatchObject({ occurredOn: '2026-08-05', amountCents: -6490 });
    expect(rows[1]?.amountCents).toBe(-5590);
    // pagamento recebido na fatura é crédito -> entra positivo
    expect(rows[2]?.amountCents).toBe(235090);
  });
});
