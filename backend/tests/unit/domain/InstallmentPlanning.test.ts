import { describe, expect, it } from 'vitest';
import {
  casaComPlano,
  chaveDaCompra,
  gerarParcelas,
} from '../../../src/domain/analysis/InstallmentPlanning.js';

describe('chaveDaCompra', () => {
  it('tira a marca de parcela, então as linhas da mesma compra convergem', () => {
    expect(chaveDaCompra('App*Upsaintgermainb - Parcela 4/6')).toBe('app upsaintgermainb');
    expect(chaveDaCompra('App*Upsaintgermainb - Parcela 5/6')).toBe('app upsaintgermainb');
    expect(chaveDaCompra('MAGAZINE LUIZA (2/12)')).toBe('magazine luiza');
  });

  it('não corta no asterisco, ao contrário da chave de recorrência', () => {
    // Aquela reduziria isto a "app", juntando compras não relacionadas.
    expect(chaveDaCompra('App*Upsaintgermainb')).toBe('app upsaintgermainb');
  });
});

describe('casaComPlano', () => {
  const plano = { merchantKey: 'app upsaintgermainb', installments: 6 };

  it('casa a linha da fatura com o plano e diz qual parcela é', () => {
    expect(casaComPlano('App*Upsaintgermainb - Parcela 4/6', plano)).toEqual({ numero: 4 });
  });

  it('recusa quando o total de parcelas é outro', () => {
    // Mesma loja, compra diferente: 6x e 10x são planos distintos.
    expect(casaComPlano('App*Upsaintgermainb - Parcela 4/10', plano)).toBeNull();
  });

  it('tolera o nome digitado sem o descritor completo do banco', () => {
    expect(
      casaComPlano('App*Upsaintgermainb - Parcela 2/6', {
        merchantKey: 'upsaintgermainb',
        installments: 6,
      }),
    ).toEqual({ numero: 2 });
  });

  it('não casa com estabelecimento diferente', () => {
    expect(casaComPlano('Ebn *Playstation - Parcela 2/6', plano)).toBeNull();
  });

  it('transação sem marca de parcela nunca casa', () => {
    expect(casaComPlano('App*Upsaintgermainb', plano)).toBeNull();
  });
});

describe('gerarParcelas', () => {
  it('reparte o total sem perder centavo', () => {
    const parcelas = gerarParcelas({
      totalCents: 100000,
      installments: 3,
      firstChargeOn: '2026-09-10',
    });

    expect(parcelas.map((p) => p.amountCents)).toEqual([33334, 33333, 33333]);
    expect(parcelas.reduce((s, p) => s + p.amountCents, 0)).toBe(100000);
  });

  it('vence uma vez por mês a partir da primeira cobrança', () => {
    const parcelas = gerarParcelas({
      totalCents: 60000,
      installments: 4,
      firstChargeOn: '2026-11-15',
    });

    expect(parcelas.map((p) => p.dueOn)).toEqual([
      '2026-11-15',
      '2026-12-15',
      '2027-01-15',
      '2027-02-15',
    ]);
  });

  it('dia 31 não escorrega para o mês seguinte', () => {
    const parcelas = gerarParcelas({
      totalCents: 30000,
      installments: 3,
      firstChargeOn: '2026-01-31',
    });

    expect(parcelas.map((p) => p.dueOn)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});
