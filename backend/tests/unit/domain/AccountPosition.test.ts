import { describe, expect, it } from 'vitest';
import { faturaEmAberto, saldoDaConta } from '../../../src/domain/analysis/AccountPosition.js';

const mov = (occurredOn: string, amountCents: number, isTransfer = false) => ({
  occurredOn,
  amountCents,
  isTransfer,
});

describe('saldoDaConta', () => {
  it('soma na âncora só o que veio depois dela', () => {
    const resultado = saldoDaConta({ onDate: '2026-08-31', balanceCents: 500000 }, [
      mov('2026-08-30', -10000), // já estava no extrato: não conta de novo
      mov('2026-08-31', -20000), // mesmo dia da âncora: idem
      mov('2026-09-01', -30000),
      mov('2026-09-02', 100000),
    ]);

    expect(resultado.balanceCents).toBe(500000 - 30000 + 100000);
    expect(resultado.asOf).toBe('2026-08-31');
  });

  it('transferência mexe no saldo, mesmo não sendo despesa', () => {
    const resultado = saldoDaConta({ onDate: '2026-08-31', balanceCents: 500000 }, [
      mov('2026-09-05', -76232, true), // pagamento da fatura
    ]);

    expect(resultado.balanceCents).toBe(500000 - 76232);
  });

  it('sem âncora não inventa saldo', () => {
    const resultado = saldoDaConta(null, [mov('2026-09-01', -30000)]);
    expect(resultado).toEqual({ balanceCents: 0, asOf: null });
  });
});

describe('faturaEmAberto', () => {
  it('conta só as compras posteriores ao último pagamento', () => {
    const resultado = faturaEmAberto([
      mov('2026-08-10', -5000),
      mov('2026-09-04', 76232, true), // pagamento da fatura de agosto
      mov('2026-09-06', -12000),
      mov('2026-09-07', -3000),
    ]);

    expect(resultado.amountCents).toBe(15000);
    expect(resultado.sinceDate).toBe('2026-09-04');
  });

  it('cartão sem pagamento nenhum está inteiro em aberto', () => {
    const resultado = faturaEmAberto([mov('2026-08-10', -5000), mov('2026-08-20', -7000)]);

    expect(resultado.amountCents).toBe(12000);
    expect(resultado.sinceDate).toBeNull();
  });

  it('estorno depois do pagamento abate a fatura', () => {
    const resultado = faturaEmAberto([
      mov('2026-09-04', 76232, true),
      mov('2026-09-06', -12000),
      mov('2026-09-08', 2000), // estorno de compra
    ]);

    expect(resultado.amountCents).toBe(10000);
  });

  it('nunca devolve dívida negativa', () => {
    const resultado = faturaEmAberto([mov('2026-09-04', 76232, true), mov('2026-09-08', 5000)]);
    expect(resultado.amountCents).toBe(0);
  });
});
