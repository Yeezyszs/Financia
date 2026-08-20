import { describe, expect, it } from 'vitest';
import { readCsv } from '../../src/infrastructure/gateways/statement/CsvReader';

describe('readCsv', () => {
  it('le CSV separado por virgula', () => {
    const table = readCsv('date,title,amount\n2026-08-20,IFOOD,89.90');
    expect(table.headers).toEqual(['date', 'title', 'amount']);
    expect(table.rows).toEqual([['2026-08-20', 'IFOOD', '89.90']]);
  });

  it('le CSV separado por ponto-e-virgula, que e o padrao do Excel pt-BR', () => {
    const table = readCsv('Data;Descricao;Valor\n20/08/2026;PADARIA;89,90');
    expect(table.headers).toEqual(['Data', 'Descricao', 'Valor']);
    expect(table.rows[0]).toEqual(['20/08/2026', 'PADARIA', '89,90']);
  });

  it('nao se perde com virgula dentro de campo entre aspas', () => {
    const table = readCsv('date,title,amount\n2026-08-20,"IFOOD, SAO PAULO",89.90');
    expect(table.rows[0]).toEqual(['2026-08-20', 'IFOOD, SAO PAULO', '89.90']);
  });

  it('escolhe o separador certo quando a descricao tem virgulas', () => {
    // Contar frequencia bruta elegeria a virgula aqui e quebraria tudo.
    const table = readCsv('Data;Descricao;Valor\n20/08/2026;IFOOD, SP, BR;89,90\n21/08/2026;UBER, RJ;12,00');
    expect(table.headers).toHaveLength(3);
    expect(table.rows[0]).toEqual(['20/08/2026', 'IFOOD, SP, BR', '89,90']);
  });

  it('entende aspas escapadas por duplicacao', () => {
    const table = readCsv('a,b\n1,"diz ""oi"" aqui"');
    expect(table.rows[0]?.[1]).toBe('diz "oi" aqui');
  });

  it('remove o BOM que o Excel coloca no inicio', () => {
    const table = readCsv('﻿date,title,amount\n2026-08-20,IFOOD,89.90');
    // Sem isso a primeira coluna viraria "﻿date" e nunca casaria.
    expect(table.headers[0]).toBe('date');
  });

  it('aceita quebra de linha do Windows', () => {
    const table = readCsv('date,title\r\n2026-08-20,IFOOD\r\n');
    expect(table.rows).toEqual([['2026-08-20', 'IFOOD']]);
  });
});
