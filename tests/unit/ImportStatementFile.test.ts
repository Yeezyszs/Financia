import { describe, expect, it } from 'vitest';
import { ImportStatementFile } from '../../src/application/use-cases/ImportStatementFile';
import { CategorizeTransaction } from '../../src/application/use-cases/CategorizeTransaction';
import { readCsv } from '../../src/infrastructure/gateways/statement/CsvReader';
import { ConfidenceParserRegistry } from '../../src/infrastructure/gateways/statement/StatementParserRegistry';
import { NubankCardStatementParser } from '../../src/infrastructure/gateways/statement/parsers/NubankCardStatementParser';
import { Category } from '../../src/domain/entities/Category';
import {
  FakeAccountRepository,
  FakeCategoryRepository,
  FakeTransactionRepository,
  account,
  category,
  sequentialIds,
} from '../fakes';

const AGOSTO = ['date,title,amount', '2026-08-20,IFOOD*IFOOD,89.90', '2026-08-19,Uber* Trip,23.45'].join('\n');

function build() {
  const transactions = new FakeTransactionRepository();
  const categories = new FakeCategoryRepository([
    new Category({ id: 'cat-0', ownerId: 'pedro', name: 'Nao categorizado' }),
    category('cat-comida', 'Alimentacao', ['IFOOD']),
    category('cat-transporte', 'Transporte', ['UBER']),
  ]);

  const useCase = new ImportStatementFile(
    new ConfidenceParserRegistry([new NubankCardStatementParser()]),
    transactions,
    new FakeAccountRepository([account('acc-1')]),
    new CategorizeTransaction(categories),
    sequentialIds('tx'),
  );

  return { useCase, transactions };
}

const input = (csv: string) => ({ ownerId: 'pedro', accountId: 'acc-1', table: readCsv(csv) });

describe('ImportStatementFile', () => {
  it('importa e ja categoriza as linhas', async () => {
    const { useCase, transactions } = build();

    const report = await useCase.execute(input(AGOSTO));

    expect(report.institution).toBe('nubank');
    expect(report.imported).toBe(2);
    expect(transactions.rows[0]?.categoryId).toBe('cat-comida');
    expect(transactions.rows[1]?.categoryId).toBe('cat-transporte');
    expect(transactions.rows[0]?.origin).toBe('statement');
  });

  it('reimportar o mesmo arquivo nao duplica nada', async () => {
    const { useCase, transactions } = build();

    await useCase.execute(input(AGOSTO));
    const second = await useCase.execute(input(AGOSTO));

    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(2);
    expect(transactions.rows).toHaveLength(2);
  });

  it('arquivos com periodo sobreposto nao duplicam a interseccao', async () => {
    // Caso real: baixar a fatura de agosto e depois a de "ultimos 90 dias".
    const { useCase, transactions } = build();
    const trimestre = [
      'date,title,amount',
      '2026-08-20,IFOOD*IFOOD,89.90',
      '2026-08-19,Uber* Trip,23.45',
      '2026-07-15,NETFLIX.COM,45.50',
    ].join('\n');

    await useCase.execute(input(AGOSTO));
    const second = await useCase.execute(input(trimestre));

    expect(second.imported).toBe(1);
    expect(second.duplicates).toBe(2);
    expect(transactions.rows).toHaveLength(3);
  });

  it('duas compras identicas no mesmo dia sao duas transacoes, nao duplicata', async () => {
    // Dois cafes na mesma padaria no mesmo dia e cenario legitimo. Deduplicar
    // por (data, lugar, valor) sem contar ocorrencia comeria um deles.
    const { useCase, transactions } = build();
    const csv = ['date,title,amount', '2026-08-20,PADARIA,7.50', '2026-08-20,PADARIA,7.50'].join('\n');

    const report = await useCase.execute(input(csv));

    expect(report.imported).toBe(2);
    expect(transactions.rows).toHaveLength(2);
    expect(transactions.rows[0]?.rawSourceId).not.toBe(transactions.rows[1]?.rawSourceId);
  });

  it('e reimportar esse arquivo continua nao duplicando', async () => {
    const { useCase, transactions } = build();
    const csv = ['date,title,amount', '2026-08-20,PADARIA,7.50', '2026-08-20,PADARIA,7.50'].join('\n');

    await useCase.execute(input(csv));
    const second = await useCase.execute(input(csv));

    expect(second.duplicates).toBe(2);
    expect(transactions.rows).toHaveLength(2);
  });

  it('variacao de acento ou espaco no export nao cria transacao nova', async () => {
    const { useCase, transactions } = build();

    await useCase.execute(input('date,title,amount\n2026-08-20,Padaria Sao Joao,7.50'));
    const second = await useCase.execute(input('date,title,amount\n2026-08-20,PADARIA  SÃO  JOÃO,7.50'));

    expect(second.duplicates).toBe(1);
    expect(transactions.rows).toHaveLength(1);
  });

  it('recusa conta de outro usuario', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ ownerId: 'arthur', accountId: 'acc-1', table: readCsv(AGOSTO) }),
    ).rejects.toThrow(/outro usuario/);
  });
});
