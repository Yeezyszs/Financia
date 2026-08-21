import { DomainError } from '../errors/DomainError.js';

/**
 * Dinheiro em centavos (inteiro com sinal). Negativo = saída.
 * Nunca usar float para valor: 0.1 + 0.2 estraga fechamento de mês.
 */
export class Money {
  private constructor(readonly cents: number) {}

  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents)) {
      throw new DomainError(`Valor em centavos precisa ser inteiro: ${cents}`, 'INVALID_MONEY');
    }
    return new Money(cents);
  }

  /**
   * Converte o valor decimal do CSV. Aceita os formatos que aparecem nos
   * exports brasileiros: "1234.56", "1.234,56", "-1234,56", "R$ 1.234,56".
   */
  static fromDecimalString(raw: string): Money {
    const cleaned = raw.trim().replace(/r\$/i, '').replace(/\s/g, '');
    if (cleaned === '') throw new DomainError('Valor vazio', 'INVALID_MONEY');

    const negative = cleaned.startsWith('-') || /^\(.*\)$/.test(cleaned);
    let digits = cleaned.replace(/[()\-+]/g, '');

    const lastComma = digits.lastIndexOf(',');
    const lastDot = digits.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : lastDot > -1 ? '.' : null;

    if (decimalSep) {
      const [int = '', frac = ''] = [
        digits.slice(0, digits.lastIndexOf(decimalSep)),
        digits.slice(digits.lastIndexOf(decimalSep) + 1),
      ];
      digits = `${int.replace(/[.,]/g, '')}.${frac}`;
    } else {
      digits = digits.replace(/[.,]/g, '');
    }

    const value = Number(digits);
    if (!Number.isFinite(value)) {
      throw new DomainError(`Valor monetário inválido: "${raw}"`, 'INVALID_MONEY');
    }

    const cents = Math.round(value * 100);
    return new Money(negative ? -cents : cents);
  }

  static fromNumber(value: number): Money {
    if (!Number.isFinite(value)) throw new DomainError('Valor inválido', 'INVALID_MONEY');
    return new Money(Math.round(value * 100));
  }

  get isExpense(): boolean {
    return this.cents < 0;
  }

  get isIncome(): boolean {
    return this.cents > 0;
  }

  get absolute(): Money {
    return new Money(Math.abs(this.cents));
  }

  plus(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  toDecimal(): number {
    return this.cents / 100;
  }

  toString(): string {
    return (this.cents / 100).toFixed(2);
  }
}
