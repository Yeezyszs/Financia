import { describe, expect, it } from 'vitest';
import { Money } from '../../../src/domain/value-objects/Money.js';

describe('Money', () => {
  it('lê o formato do CSV do Nubank (ponto decimal)', () => {
    expect(Money.fromDecimalString('-123.45').cents).toBe(-12345);
    expect(Money.fromDecimalString('1500.00').cents).toBe(150000);
  });

  it('lê o formato brasileiro com milhar', () => {
    expect(Money.fromDecimalString('1.234,56').cents).toBe(123456);
    expect(Money.fromDecimalString('R$ -1.234,56').cents).toBe(-123456);
  });

  it('não perde centavo em soma', () => {
    const total = [0.1, 0.2, 0.3].map(Money.fromNumber).reduce((a, b) => a.plus(b));
    expect(total.cents).toBe(60);
  });

  it('classifica entrada e saída pelo sinal', () => {
    expect(Money.fromCents(-100).isExpense).toBe(true);
    expect(Money.fromCents(100).isIncome).toBe(true);
  });

  it('rejeita valor não inteiro em centavos', () => {
    expect(() => Money.fromCents(10.5)).toThrow();
  });
});
