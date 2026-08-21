import { beforeEach, describe, expect, it } from 'vitest';
import { ImportStatementUseCase } from '../../../src/application/use-cases/imports/ImportStatementUseCase.js';
import { ParserRegistry } from '../../../src/infrastructure/parsers/ParserRegistry.js';
import { Sha256Hasher } from '../../../src/infrastructure/services/Sha256Hasher.js';
import { EXTRATO_ISO, FATURA } from '../../fixtures/nubank.js';
import {
  InMemoryAccountRepository,
  InMemoryCategoryRepository,
  InMemoryCategoryRuleRepository,
  InMemoryImportRepository,
  InMemoryTransactionRepository,
  SequentialIds,
  USER_ID,
  makeCard,
  makeCategory,
  makeChecking,
  makeRule,
} from '../../doubles/InMemoryRepositories.js';

function setup() {
  const accounts = new InMemoryAccountRepository([makeChecking(), makeCard()]);
  const imports = new InMemoryImportRepository();
  const transactions = new InMemoryTransactionRepository();
  const categories = new InMemoryCategoryRepository([
    makeCategory('cat-food', 'Alimentação', 'expense'),
    makeCategory('cat-transport', 'Transporte', 'expense'),
    makeCategory('cat-salary', 'Salário', 'income'),
    makeCategory('cat-transfer', 'Transferências', 'transfer'),
  ]);
  const rules = new InMemoryCategoryRuleRepository([
    makeRule('rule-transfer', 'pagamento de fatura', 'cat-transfer', 1),
    makeRule('rule-uber', 'uber', 'cat-transport'),
    makeRule('rule-padaria', 'padaria', 'cat-food', 20),
    makeRule('rule-salary', 'salario', 'cat-salary'),
  ]);

  const useCase = new ImportStatementUseCase(
    accounts,
    imports,
    transactions,
    categories,
    rules,
    new ParserRegistry(),
    new SequentialIds(),
    new Sha256Hasher(),
  );

  return { useCase, accounts, imports, transactions, categories, rules };
}

const baseInput = {
  userId: USER_ID,
  accountId: 'acc-checking',
  filename: 'nubank-agosto.csv',
  content: EXTRATO_ISO,
};

describe('ImportStatementUseCase', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('importa o extrato inteiro e registra o import', async () => {
    const result = await ctx.useCase.execute(baseInput);

    expect(result).toMatchObject({
      rowsTotal: 5,
      rowsImported: 5,
      rowsDuplicated: 0,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-04',
    });
    expect(ctx.transactions.transactions).toHaveLength(5);
    expect(ctx.imports.records[0]?.status).toBe('completed');
  });

  it('categoriza pelas regras e conta os acertos', async () => {
    const result = await ctx.useCase.execute(baseInput);
    const byDescription = (needle: string) =>
      ctx.transactions.transactions.find((t) => t.description.toLowerCase().includes(needle));

    expect(byDescription('uber')?.categoryId).toBe('cat-transport');
    expect(byDescription('uber')?.categorizedBy).toBe('rule');
    expect(byDescription('salario')?.categoryId).toBe('cat-salary');
    expect(result.categorized).toBe(5);
    expect(ctx.rules.hits).toHaveLength(5);
  });

  it('marca pagamento de fatura como transferência, fora de receita e despesa', async () => {
    await ctx.useCase.execute(baseInput);
    const payment = ctx.transactions.transactions.find((t) =>
      t.description.includes('Pagamento de fatura'),
    );

    expect(payment?.isTransfer).toBe(true);
    expect(payment?.countsAsExpense).toBe(false);
  });

  it('preserva duas compras idênticas no mesmo dia', async () => {
    await ctx.useCase.execute(baseInput);
    const padaria = ctx.transactions.transactions.filter((t) => t.description.includes('PADARIA'));

    expect(padaria).toHaveLength(2);
    expect(padaria[0]?.fingerprint).not.toBe(padaria[1]?.fingerprint);
  });

  it('barra a reimportação do mesmo arquivo', async () => {
    await ctx.useCase.execute(baseInput);
    await expect(ctx.useCase.execute(baseInput)).rejects.toThrow(/já foi importado/i);
    expect(ctx.transactions.transactions).toHaveLength(5);
  });

  it('com force, reimporta o arquivo sem duplicar nenhuma linha', async () => {
    await ctx.useCase.execute(baseInput);
    const result = await ctx.useCase.execute({ ...baseInput, force: true });

    expect(result.rowsImported).toBe(0);
    expect(result.rowsDuplicated).toBe(5);
    expect(ctx.transactions.transactions).toHaveLength(5);
  });

  it('importa só as linhas novas quando dois arquivos se sobrepõem', async () => {
    await ctx.useCase.execute(baseInput);

    const semanaSeguinte = `date,title,amount
2026-08-04,Uber *TRIP,-27.80
2026-08-08,Mercado Livre,-99.90
`;
    const result = await ctx.useCase.execute({
      ...baseInput,
      filename: 'nubank-semana-2.csv',
      content: semanaSeguinte,
    });

    expect(result).toMatchObject({ rowsTotal: 2, rowsImported: 1, rowsDuplicated: 1 });
    expect(ctx.transactions.transactions).toHaveLength(6);
  });

  it('usa o parser da fatura quando a conta é cartão (sinal invertido)', async () => {
    await ctx.useCase.execute({
      ...baseInput,
      accountId: 'acc-card',
      filename: 'fatura.csv',
      content: FATURA,
    });

    const ifood = ctx.transactions.transactions.find((t) => t.description.includes('Ifood'));
    expect(ifood?.amount.cents).toBe(-6490);
    expect(ifood?.countsAsExpense).toBe(true);
  });

  it('registra a falha no histórico quando o CSV não é reconhecido', async () => {
    await expect(
      ctx.useCase.execute({ ...baseInput, content: 'coluna_a,coluna_b\n1,2' }),
    ).rejects.toThrow();

    expect(ctx.imports.records[0]?.status).toBe('failed');
    expect(ctx.imports.records[0]?.toJSON().errorMessage).toMatch(/não parece um extrato/i);
  });

  it('recusa importar para conta inexistente', async () => {
    await expect(
      ctx.useCase.execute({ ...baseInput, accountId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow(/não encontrad/i);
  });
});
