import { describe, expect, it } from 'vitest';
import {
  detectRecurring,
  merchantKey,
  type AnalyzableTransaction,
} from '../../../src/domain/analysis/RecurringDetector.js';

function tx(
  occurredOn: string,
  description: string,
  amountCents: number,
  categoryId: string | null = null,
): AnalyzableTransaction {
  return { occurredOn, description, amountCents, categoryId };
}

describe('merchantKey', () => {
  it('junta o mesmo estabelecimento com sufixos diferentes', () => {
    expect(merchantKey('Ifood *Restaurante Sabor')).toBe(merchantKey('Ifood *Outro Lugar'));
  });

  it('descarta o prefixo que o banco cola na frente', () => {
    expect(merchantKey('Compra no débito - ASSAI ATACADISTA')).toBe(
      merchantKey('ASSAI ATACADISTA'),
    );
  });

  it('trata parcelas como a mesma compra', () => {
    expect(merchantKey('Magazine Luiza 3 12')).toBe(merchantKey('Magazine Luiza 4 12'));
  });

  it('não confunde estabelecimentos diferentes', () => {
    expect(merchantKey('Netflix.com')).not.toBe(merchantKey('Spotify'));
  });
});

describe('detectRecurring', () => {
  it('encontra assinatura de valor fixo', () => {
    const grupos = detectRecurring([
      tx('2026-06-05', 'Netflix.com', -5590),
      tx('2026-07-05', 'Netflix.com', -5590),
      tx('2026-08-05', 'Netflix.com', -5590),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({
      kind: 'subscription',
      occurrences: 3,
      monthsSeen: 3,
      typicalCents: 5590,
      monthlyAverageCents: 5590,
      lastSeen: '2026-08-05',
    });
  });

  it('separa hábito de valor variável de assinatura', () => {
    const grupos = detectRecurring([
      tx('2026-06-03', 'ASSAI ATACADISTA', -34712),
      tx('2026-06-20', 'ASSAI ATACADISTA', -12040),
      tx('2026-07-04', 'ASSAI ATACADISTA', -51900),
      tx('2026-08-02', 'ASSAI ATACADISTA', -28800),
    ]);

    expect(grupos[0]?.kind).toBe('recurring');
    // média mensal considera meses distintos, não número de compras
    expect(grupos[0]?.monthsSeen).toBe(3);
    expect(grupos[0]?.monthlyAverageCents).toBe(Math.round((34712 + 12040 + 51900 + 28800) / 3));
  });

  it('ignora quem apareceu em menos meses que o mínimo', () => {
    const grupos = detectRecurring([
      tx('2026-08-01', 'Loja Qualquer', -1000),
      tx('2026-08-15', 'Loja Qualquer', -1000),
    ]);

    expect(grupos).toHaveLength(0);
  });

  it('ignora entradas: salário recorrente não é gasto a cortar', () => {
    const grupos = detectRecurring([
      tx('2026-06-01', 'Salario Empresa', 850000),
      tx('2026-07-01', 'Salario Empresa', 850000),
      tx('2026-08-01', 'Salario Empresa', 850000),
    ]);

    expect(grupos).toHaveLength(0);
  });

  it('ordena pelo que pesa mais no mês', () => {
    const grupos = detectRecurring([
      tx('2026-06-05', 'Netflix.com', -5590),
      tx('2026-07-05', 'Netflix.com', -5590),
      tx('2026-08-05', 'Netflix.com', -5590),
      tx('2026-06-10', 'Aluguel', -280000),
      tx('2026-07-10', 'Aluguel', -280000),
      tx('2026-08-10', 'Aluguel', -280000),
    ]);

    expect(grupos.map((g) => g.label)).toEqual(['Aluguel', 'Netflix.com']);
  });

  it('usa o nome do estabelecimento quando as descrições variam', () => {
    const grupos = detectRecurring([
      tx('2026-06-05', 'IFOOD *ANTIGO', -4000),
      tx('2026-07-05', 'IFOOD *MEIO', -4200),
      tx('2026-08-05', 'Ifood *Restaurante Novo', -3900),
    ]);

    // qualquer uma das três seria um rótulo arbitrário para o grupo
    expect(grupos[0]?.label).toBe('Ifood');
  });

  it('mantém a descrição literal quando ela é sempre a mesma', () => {
    const grupos = detectRecurring([
      tx('2026-06-05', 'Netflix.com', -5590),
      tx('2026-07-05', 'Netflix.com', -5590),
      tx('2026-08-05', 'Netflix.com', -5590),
    ]);

    expect(grupos[0]?.label).toBe('Netflix.com');
  });

  it('compra semanal de valor parecido não é assinatura', () => {
    // Quatro idas ao atacadista por mês, valores próximos: sem olhar a
    // cadência isso passaria por assinatura e inflaria o gasto fixo.
    const compras: ReturnType<typeof tx>[] = [];
    for (const mes of ['06', '07', '08']) {
      for (const [i, dia] of ['03', '09', '15', '21'].entries()) {
        compras.push(tx(`2026-${mes}-${dia}`, 'ASSAI ATACADISTA', -(30000 + i * 2000)));
      }
    }

    const grupos = detectRecurring(compras);

    expect(grupos[0]?.kind).toBe('recurring');
    expect(grupos[0]?.occurrences).toBe(12);
    expect(grupos[0]?.monthsSeen).toBe(3);
  });
});
