import { DomainError } from '../errors/DomainError.js';

/**
 * Dinheiro sempre em centavos (inteiro). Float com dinheiro acumula erro de
 * arredondamento: 0.1 + 0.2 !== 0.3 em ponto flutuante. Somar centavos e
 * dividir so na hora de exibir elimina a classe inteira de bug.
 */
export class Money {
  private constructor(
    readonly cents: number,
    readonly currency: string,
  ) {}

  static fromCents(cents: number, currency = 'BRL'): Money {
    if (!Number.isInteger(cents)) {
      throw new DomainError(`Valor em centavos deve ser inteiro, recebido: ${cents}`, 'MONEY_NOT_INTEGER');
    }
    return new Money(cents, currency);
  }

  /**
   * Aceita os formatos que aparecem em e-mail de banco brasileiro:
   * "R$ 1.234,56" | "1.234,56" | "1234,56" | "1234.56"
   */
  static fromBRLString(raw: string): Money {
    const cleaned = raw.replace(/[R$\s ]/gi, '').trim();
    if (cleaned === '') {
      throw new DomainError(`Valor monetario vazio: "${raw}"`, 'MONEY_PARSE_FAILED');
    }

    // Se tem virgula, ela e o separador decimal e ponto e separador de milhar.
    // Se nao tem virgula, o ponto (se houver) e o separador decimal.
    const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;

    if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
      throw new DomainError(`Valor monetario invalido: "${raw}"`, 'MONEY_PARSE_FAILED');
    }

    return Money.fromCents(Math.round(Number(normalized) * 100));
  }

  negated(): Money {
    return new Money(-this.cents, this.currency);
  }

  get isNegative(): boolean {
    return this.cents < 0;
  }

  format(locale = 'pt-BR'): string {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: this.currency }).format(this.cents / 100);
  }
}
