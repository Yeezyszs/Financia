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

/**
 * O segundo formato de extrato do C6, o que o app do banco exporta hoje:
 * cinco linhas de preâmbulo antes do cabeçalho, decimal com ponto,
 * entrada e saída em colunas separadas, e `Título` ao lado de
 * `Descrição`. Valores e nomes aqui são inventados — o arquivo que
 * motivou o teste trazia conta e nomes de pessoas de verdade.
 */
const EXTRATO_NOVO = `EXTRATO DE CONTA CORRENTE C6 BANK

Agência: 1 / Conta: 000000000
Extrato gerado em 06/10/2026 - as 11:04:55

Extrato de 06/09/2026 a 06/10/2026


Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)
09/09/2026,09/09/2026,Pix recebido de Fulano de Tal,Pix recebido de Fulano de Tal,65.00,0.00,3.98
09/09/2026,09/09/2026,Tesouro Direto,IPCA+ 2032,0.00,61.02,3.98
06/10/2026,06/10/2026,PGTO FAT CARTAO C6,Fatura de cartão,0.00,683.88,219.52
06/10/2026,06/10/2026,Pix enviado para Beltrano,TRANSF ENVIADA PIX,0.00,1000.00,219.52
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
/**
 * O app do C6 mudou o formato do extrato, e o anterior continua valendo
 * para quem tem arquivo antigo guardado. Os dois são o mesmo layout.
 */
describe('extrato do C6 no formato exportado pelo app', () => {
  const parser = new StatementCsvParser(C6_CONTA);

  it('acha o cabeçalho depois do preâmbulo', () => {
    expect(parser.supports(EXTRATO_NOVO)).toBe(true);
  });

  it('transforma entrada e saída em um valor com sinal', () => {
    const { rows } = parser.parse(EXTRATO_NOVO);

    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ occurredOn: '2026-09-09', amountCents: 6500 });
    expect(rows[1]?.amountCents).toBe(-6102);
    expect(rows[3]?.amountCents).toBe(-100000);
  });

  it('usa o título, que é onde está o que aconteceu', () => {
    // "TRANSF ENVIADA PIX" não diz para quem; o título diz.
    const { rows } = parser.parse(EXTRATO_NOVO);

    expect(rows[3]?.description).toBe('Pix enviado para Beltrano');
    expect(rows[3]?.raw?.detalhe).toBe('TRANSF ENVIADA PIX');
  });

  it('não desiste do preâmbulo reclamando da primeira linha', () => {
    // O erro antigo dizia "Colunas encontradas: EXTRATO DE CONTA
    // CORRENTE C6 BANK", que não ajudava ninguém a entender nada.
    const semCabecalho = 'EXTRATO DE CONTA CORRENTE C6 BANK\n\nAgência: 1 / Conta: 000000000\n';

    expect(() => parser.parse(semCabecalho)).toThrow(/Colunas encontradas/);
    expect(parser.supports(semCabecalho)).toBe(false);
  });
});
