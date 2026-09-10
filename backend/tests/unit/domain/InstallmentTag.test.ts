import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lerParcela } from '../../../src/domain/analysis/InstallmentTag.js';

describe('lerParcela', () => {
  /** Descrições tiradas do banco do Pedro. */
  it('lê os formatos que aparecem nas faturas reais', () => {
    expect(lerParcela('App*Upsaintgermainb - Parcela 4/6')).toEqual({ numero: 4, total: 6 });
    expect(lerParcela('Ebn *Playstation - Parcela 2/4')).toEqual({ numero: 2, total: 4 });
    expect(lerParcela('Mp *Aliexpress - Parcela 10/10')).toEqual({ numero: 10, total: 10 });
    expect(lerParcela('Pix no Crédito - Pagar Me Pagamentos - 3/3')).toEqual({
      numero: 3,
      total: 3,
    });
  });

  it('lê a variante do C6, que o parser anexa entre parênteses', () => {
    expect(lerParcela('MAGAZINE LUIZA (2/12)')).toEqual({ numero: 2, total: 12 });
    expect(lerParcela('CASAS BAHIA (3 de 10)')).toEqual({ numero: 3, total: 10 });
  });

  it('ignora número que não está no fim da descrição', () => {
    // O "24/7" aqui é parte do nome, não uma parcela.
    expect(lerParcela('POSTO 24/7 CONVENIENCIA')).toBeNull();
  });

  it('recusa combinação impossível', () => {
    expect(lerParcela('Compra - Parcela 7/3')).toBeNull();
    expect(lerParcela('Compra - Parcela 1/1')).toBeNull();
    expect(lerParcela('Compra - Parcela 0/6')).toBeNull();
  });

  it('descrição sem parcela nenhuma devolve nulo', () => {
    expect(lerParcela('Netflix.com')).toBeNull();
    expect(lerParcela('AUTO POSTO M   M')).toBeNull();
    expect(lerParcela('Transferência recebida - SALARIO')).toBeNull();
  });
});

/**
 * A tela repete esta leitura para marcar a linha e propor o cadastro
 * sem ida ao servidor. Repetição a gente aceita; divergência silenciosa,
 * não — uma marca que o servidor reconhece e a tela ignora (ou o
 * contrário) é um bug que ninguém vê acontecer.
 */
describe('padrões espelhados no frontend', () => {
  function padroesDe(caminho: string): string {
    const arquivo = readFileSync(new URL(caminho, import.meta.url), 'utf8');
    const bloco = /const PADROES = \[(.*?)\];/s.exec(arquivo);
    expect(bloco, `não achei o bloco PADROES em ${caminho}`).not.toBeNull();
    return bloco![1]!.replace(/\s+/g, '');
  }

  it('a cópia do frontend usa exatamente os mesmos padrões', () => {
    expect(padroesDe('../../../../frontend/src/parcela.ts')).toBe(
      padroesDe('../../../src/domain/analysis/InstallmentTag.ts'),
    );
  });
});
