import { describe, expect, it } from 'vitest';
import { conferirSinais, direcaoPelaDescricao } from '../../../src/domain/analysis/SignCheck.js';

describe('direcaoPelaDescricao', () => {
  it('lê saída e entrada do texto do extrato', () => {
    expect(direcaoPelaDescricao('Transferência enviada pelo Pix - TIM S A')).toBe('saida');
    expect(direcaoPelaDescricao('Compra no débito - ASSAI ATACADISTA')).toBe('saida');
    expect(direcaoPelaDescricao('Transferência recebida - SALARIO')).toBe('entrada');
    expect(direcaoPelaDescricao('Estorno de compra')).toBe('entrada');
  });

  it('"pagamento recebido" é entrada, apesar de conter "pagamento"', () => {
    expect(direcaoPelaDescricao('Pagamento recebido')).toBe('entrada');
  });

  it('não inventa direção para descrição neutra', () => {
    expect(direcaoPelaDescricao('Netflix.com')).toBeNull();
    expect(direcaoPelaDescricao('AUTO POSTO M M')).toBeNull();
  });
});

describe('conferirSinais', () => {
  /** Os lançamentos que passaram batido nos dados reais. */
  it('acha a transferência enviada gravada como entrada', () => {
    const suspeitos = conferirSinais([
      {
        occurredOn: '2026-08-11',
        description: 'Transferência enviada pelo Pix - Tesouro Nacional',
        amountCents: 2000,
      },
      {
        occurredOn: '2026-08-13',
        description: 'Transferência enviada pelo Pix - IMPLY RENTAL',
        amountCents: 5698,
      },
      {
        occurredOn: '2026-08-05',
        description: 'Transferência enviada pelo Pix - BANCO VOTORANTIM',
        amountCents: -61800,
      },
      {
        occurredOn: '2026-08-01',
        description: 'Transferência recebida - SALARIO',
        amountCents: 1250000,
      },
      { occurredOn: '2026-08-02', description: 'Netflix.com', amountCents: 5590 },
    ]);

    expect(suspeitos).toHaveLength(2);
    expect(suspeitos.map((s) => s.esperado)).toEqual(['saida', 'saida']);
    expect(suspeitos[0]?.description).toContain('Tesouro Nacional');
  });

  it('extrato coerente não gera aviso nenhum', () => {
    expect(
      conferirSinais([
        {
          occurredOn: '2026-08-01',
          description: 'Transferência recebida - SALARIO',
          amountCents: 1250000,
        },
        { occurredOn: '2026-08-05', description: 'Pix enviado - MARIA', amountCents: -12000 },
      ]),
    ).toEqual([]);
  });
});
