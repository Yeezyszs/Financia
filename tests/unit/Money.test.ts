import { describe, expect, it } from 'vitest';
import { Money } from '../../src/domain/entities/Money.js';

describe('Money', () => {
  it('parseia os formatos que aparecem em e-mail de banco brasileiro', () => {
    expect(Money.fromBRLString('R$ 1.234,56').cents).toBe(123456);
    expect(Money.fromBRLString('1.234,56').cents).toBe(123456);
    expect(Money.fromBRLString('89,90').cents).toBe(8990);
    expect(Money.fromBRLString('R$12,00').cents).toBe(1200);
    expect(Money.fromBRLString('1234.56').cents).toBe(123456);
  });

  it('nao acumula erro de ponto flutuante ao somar', () => {
    const total = [Money.fromBRLString('0,10'), Money.fromBRLString('0,20')].reduce((s, m) => s + m.cents, 0);
    expect(total).toBe(30);
  });

  it('rejeita valor malformado em vez de gravar lixo', () => {
    expect(() => Money.fromBRLString('R$ abc')).toThrow(/invalido/);
    expect(() => Money.fromBRLString('')).toThrow(/vazio/);
    expect(() => Money.fromCents(10.5)).toThrow(/inteiro/);
  });

  it('formata em pt-BR', () => {
    expect(Money.fromCents(123456).format().replace(/ /g, ' ')).toBe('R$ 1.234,56');
  });
});
