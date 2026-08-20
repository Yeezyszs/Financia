import { describe, expect, it } from 'vitest';
import { readCsv } from '../../src/infrastructure/gateways/statement/CsvReader';
import { ConfidenceParserRegistry } from '../../src/infrastructure/gateways/statement/StatementParserRegistry';
import { GenericStatementParser } from '../../src/infrastructure/gateways/statement/parsers/GenericStatementParser';
import { NubankCardStatementParser } from '../../src/infrastructure/gateways/statement/parsers/NubankCardStatementParser';
import { parseAmount, parseDate } from '../../src/infrastructure/gateways/statement/parsers/columns';

const NUBANK_CSV = [
  'date,title,amount',
  '2026-08-20,IFOOD*IFOOD,89.90',
  '2026-08-19,Uber* Trip,23.45',
  '2026-08-18,Pagamento recebido,-1200.00',
].join('\n');

// Cabecalhos deliberadamente diferentes: o teste prova que a deteccao nao
// depende de conhecer os nomes de coluna de cada banco.
const OUTRO_BANCO_CSV = [
  'Data da compra;Historico;Valor (R$)',
  '20/08/2026;NETFLIX.COM;45,50',
  '19/08/2026;POSTO SHELL 123;180,00',
  'Total da fatura;;225,50',
].join('\n');

describe('parseAmount', () => {
  it('aceita formato brasileiro e americano', () => {
    expect(parseAmount('1.234,56')?.cents).toBe(123456);
    expect(parseAmount('1234.56')?.cents).toBe(123456);
    expect(parseAmount('89,90')?.cents).toBe(8990);
  });

  it('entende negativo com sinal e entre parenteses', () => {
    expect(parseAmount('-89,90')?.cents).toBe(-8990);
    expect(parseAmount('(89,90)')?.cents).toBe(-8990);
  });

  it('devolve null para texto que nao e valor', () => {
    expect(parseAmount('Total da fatura')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});

describe('parseDate', () => {
  it('aceita ISO e formato brasileiro', () => {
    expect(parseDate('2026-08-20')?.toISOString()).toBe('2026-08-20T15:00:00.000Z');
    expect(parseDate('20/08/2026')?.toISOString()).toBe('2026-08-20T15:00:00.000Z');
  });

  it('ancora ao meio-dia de Sao Paulo para nao vazar para o dia vizinho', () => {
    const date = parseDate('01/09/2026')!;
    // Meio-dia BRT = 15h UTC; o dia continua sendo 1 em qualquer leitura.
    expect(date.toISOString().slice(0, 10)).toBe('2026-09-01');
  });

  it('devolve null para o que nao e data', () => {
    expect(parseDate('Total')).toBeNull();
  });
});

describe('NubankCardStatementParser', () => {
  const parser = new NubankCardStatementParser();

  it('reconhece o cabecalho do Nubank com alta confianca', () => {
    expect(parser.confidence(readCsv(NUBANK_CSV))).toBeGreaterThan(0.9);
    expect(parser.confidence(readCsv(OUTRO_BANCO_CSV))).toBeLessThan(0.5);
  });

  it('extrai as linhas e marca valor negativo como estorno', () => {
    const entries = parser.parse(readCsv(NUBANK_CSV));

    expect(entries).toHaveLength(3);
    expect(entries[0]?.amount.cents).toBe(8990);
    expect(entries[0]?.merchant).toBe('IFOOD*IFOOD');
    expect(entries[0]?.kind).toBe('purchase');
    expect(entries[2]?.amount.cents).toBe(-120000);
    expect(entries[2]?.kind).toBe('refund');
  });
});

describe('GenericStatementParser', () => {
  const parser = new GenericStatementParser();

  it('descobre as colunas de um banco que nunca viu', () => {
    const entries = parser.parse(readCsv(OUTRO_BANCO_CSV));

    expect(entries).toHaveLength(2);
    expect(entries[0]?.merchant).toBe('NETFLIX.COM');
    expect(entries[0]?.amount.cents).toBe(4550);
    expect(entries[1]?.amount.cents).toBe(18000);
  });

  it('ignora linha de rodape sem data', () => {
    const entries = parser.parse(readCsv(OUTRO_BANCO_CSV));
    expect(entries.map((e) => e.merchant)).not.toContain('');
  });

  it('captura parcelamento escrito na descricao', () => {
    const csv = 'Data;Descricao;Valor\n20/08/2026;MAGAZINE LUIZA parcela 2 de 10;300,00';
    expect(parser.parse(readCsv(csv))[0]?.installment).toEqual({ current: 2, total: 10 });
  });

  it('explica o que faltou quando nao identifica as colunas', () => {
    expect(() => parser.parse(readCsv('a;b\nx;y'))).toThrow(/Cabecalho lido/);
  });
});

describe('ConfidenceParserRegistry', () => {
  it('prefere o parser dedicado quando o formato e reconhecido', () => {
    const registry = new ConfidenceParserRegistry([new NubankCardStatementParser()]);
    expect(registry.resolve(readCsv(NUBANK_CSV)).institution).toBe('nubank');
  });

  it('cai no generico para formato desconhecido', () => {
    const registry = new ConfidenceParserRegistry([new NubankCardStatementParser()]);
    expect(registry.resolve(readCsv(OUTRO_BANCO_CSV)).institution).toBe('generico');
  });
});
