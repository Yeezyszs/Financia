import { describe, expect, it } from 'vitest';
import { NubankEmailParser } from '../../src/infrastructure/gateways/email/parsers/NubankEmailParser';
import { C6EmailParser } from '../../src/infrastructure/gateways/email/parsers/C6EmailParser';
import { cleanMerchant, findDateTime } from '../../src/infrastructure/gateways/email/parsers/patterns';
import type { RawEmail } from '../../src/application/ports/EmailParser';

/**
 * ATENCAO: estes fixtures sao SINTETICOS - escritos a partir do formato
 * conhecido, nao capturados de e-mail real. Eles documentam o que o parser
 * assume hoje. Depois de rodar `npm run explore`, troque por fixtures reais
 * anonimizados; se algum destes testes quebrar nessa troca, o teste e que
 * estava errado, nao o e-mail.
 */
function email(subject: string, body: string): RawEmail {
  return {
    id: 'msg-1',
    from: 'todomundo@nubank.com.br',
    subject,
    receivedAt: new Date('2026-08-20T21:00:00Z'),
    body,
  };
}

describe('NubankEmailParser', () => {
  const parser = new NubankEmailParser();

  it('extrai valor, estabelecimento, data e final do cartao', () => {
    const result = parser.parse(
      email(
        'Compra aprovada',
        'Compra aprovada no cartao final 1234: R$ 89,90 em IFOOD*IFOOD, 20/08/2026 as 18:30',
      ),
    );

    expect(result?.amount.cents).toBe(8990);
    expect(result?.merchant).toBe('IFOOD');
    expect(result?.last4).toBe('1234');
    expect(result?.kind).toBe('purchase');
  });

  it('reconhece estorno e inverte o sinal', () => {
    const result = parser.parse(
      email('Estorno de compra', 'Estorno de R$ 89,90 em IFOOD no cartao final 1234, 21/08/2026'),
    );

    expect(result?.kind).toBe('refund');
    expect(result?.amount.cents).toBe(-8990);
  });

  it('captura parcelamento', () => {
    const result = parser.parse(
      email('Compra aprovada', 'Compra aprovada: R$ 300,00 em MAGAZINE LUIZA, parcela 2 de 10, 20/08/2026'),
    );

    expect(result?.installment).toEqual({ current: 2, total: 10 });
  });

  it('nao reage a e-mail de fatura do mesmo remetente', () => {
    expect(parser.canParse(email('Sua fatura fechou', 'Fatura de R$ 1.200,00 disponivel'))).toBe(false);
    expect(parser.canParse(email('Fatura vencendo', 'Vence amanha'))).toBe(false);
  });

  it('devolve null quando nao acha valor, em vez de lancar', () => {
    expect(parser.parse(email('Compra aprovada', 'Sem valor nenhum aqui'))).toBeNull();
  });
});

describe('C6EmailParser', () => {
  const parser = new C6EmailParser();

  it('le o formato rotulado do C6', () => {
    const result = parser.parse(
      email(
        'Compra aprovada no seu cartao C6',
        ['Valor: R$ 45,50', 'Estabelecimento: NETFLIX.COM', 'Cartao final 5678', 'Data: 19/08/2026 09:15'].join('\n'),
      ),
    );

    expect(result?.amount.cents).toBe(4550);
    expect(result?.merchant).toBe('NETFLIX.COM');
    expect(result?.last4).toBe('5678');
  });

  it('ignora e-mail de limite e de fatura', () => {
    expect(parser.canParse(email('Seu limite disponivel', 'R$ 5.000,00'))).toBe(false);
    expect(parser.canParse(email('Fatura do C6', 'Fechou'))).toBe(false);
  });
});

describe('patterns', () => {
  it('limpa sufixo de adquirente e cidade do estabelecimento', () => {
    expect(cleanMerchant('IFOOD*IFOOD SAO PAULO BR')).toBe('IFOOD');
    expect(cleanMerchant('PAG*PadariaSaoJoao')).toBe('PAG');
    expect(cleanMerchant('UBER   *TRIP  ')).toBe('UBER');
    expect(cleanMerchant('NETFLIX.COM,')).toBe('NETFLIX.COM');
  });

  it('interpreta a data no fuso de Sao Paulo, nao em UTC', () => {
    // 22h em Sao Paulo e 01h UTC do dia seguinte. Tratar como UTC jogaria a
    // compra para o dia errado e erraria a virada do mes no relatorio.
    const date = findDateTime('compra em 31/08/2026 as 22:00', new Date());
    expect(date.toISOString()).toBe('2026-09-01T01:00:00.000Z');
  });

  it('cai no horario de recebimento quando o e-mail nao traz data', () => {
    const fallback = new Date('2026-08-20T21:00:00Z');
    expect(findDateTime('sem data aqui', fallback)).toEqual(fallback);
  });
});
