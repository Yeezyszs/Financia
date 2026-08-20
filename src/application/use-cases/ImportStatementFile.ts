import { Transaction } from '../../domain/entities/Transaction';
import { normalizeMerchant } from '../../domain/entities/Category';
import { DomainError } from '../../domain/errors/DomainError';
import type { ParsedStatementEntry, StatementParserRegistry, StatementTable } from '../ports/StatementParser';
import type { IdGenerator } from '../ports/IdGenerator';
import type { AccountRepository, TransactionRepository } from '../ports/repositories';
import type { CategorizeTransaction } from './CategorizeTransaction';

export interface ImportReport {
  institution: string;
  imported: number;
  duplicates: number;
  /** Linhas que nao viraram transacao: rodape, saldo anterior, linha vazia. */
  skipped: number;
  failures: Array<{ line: number; reason: string }>;
}

/**
 * Importa um extrato/fatura ja lido em tabela.
 *
 * O problema dificil aqui e IDENTIDADE. Na ingestao por e-mail, o Message-ID
 * do Gmail da a chave de idempotencia de graca. Um CSV nao tem nada disso: o
 * mesmo arquivo baixado duas vezes, ou dois arquivos com periodos que se
 * sobrepoem, produzem exatamente as mesmas linhas.
 *
 * A saida e derivar a identidade do proprio dado:
 *
 *     csv:<conta>:<data>:<estabelecimento>:<centavos>:<ocorrencia>
 *
 * O ultimo campo existe porque duas compras iguais no mesmo dia e no mesmo
 * lugar sao legitimas - dois cafes na mesma padaria nao sao duplicata. A
 * ocorrencia numera as repeticoes dentro do grupo (data, estabelecimento,
 * valor), o que mantem a chave estavel entre importacoes: o mesmo dia sempre
 * gera a mesma sequencia.
 *
 * Limite conhecido: um arquivo PARCIAL que contenha so a segunda das duas
 * compras iguais numera ela como ocorrencia 0 e ela colide com a primeira,
 * sendo tratada como duplicata. Na pratica isso exigiria um extrato cortado no
 * meio de um dia, o que os bancos nao fazem - eles exportam por periodo
 * fechado. Preferi esse risco ao inverso, que seria duplicar lancamento a cada
 * reimportacao e envenenar o total.
 */
export class ImportStatementFile {
  constructor(
    private readonly parsers: StatementParserRegistry,
    private readonly transactions: TransactionRepository,
    private readonly accounts: AccountRepository,
    private readonly categorize: CategorizeTransaction,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: { ownerId: string; accountId: string; table: StatementTable }): Promise<ImportReport> {
    const account = await this.accounts.findById(input.accountId);
    if (!account) {
      throw new DomainError(`Conta ${input.accountId} nao encontrada`, 'ACCOUNT_NOT_FOUND');
    }
    if (account.ownerId !== input.ownerId) {
      throw new DomainError('Conta pertence a outro usuario', 'ACCOUNT_OWNER_MISMATCH');
    }

    const parser = this.parsers.resolve(input.table);
    const report: ImportReport = {
      institution: parser.institution,
      imported: 0,
      duplicates: 0,
      skipped: 0,
      failures: [],
    };

    const entries = parser.parse(input.table);
    report.skipped = input.table.rows.length - entries.length;

    const occurrences = new Map<string, number>();

    for (const entry of entries) {
      try {
        const sourceId = this.buildSourceId(input.accountId, entry, occurrences);

        const { categoryId } = await this.categorize.execute({
          ownerId: input.ownerId,
          merchant: entry.merchant,
        });

        const transaction = new Transaction({
          id: this.ids.next(),
          ownerId: input.ownerId,
          accountId: input.accountId,
          amount: entry.amount,
          merchant: entry.merchant,
          occurredAt: entry.occurredAt,
          kind: entry.kind,
          categoryId,
          origin: 'statement',
          rawSourceId: sourceId,
          installment: entry.installment ?? null,
        });

        const saved = await this.transactions.createIfAbsent(transaction);
        if (saved) report.imported += 1;
        else report.duplicates += 1;
      } catch (error) {
        // Uma linha estranha nao pode abortar o arquivo inteiro.
        report.failures.push({
          line: entry.lineNumber + 2, // +1 pelo cabecalho, +1 porque humano conta de 1
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return report;
  }

  private buildSourceId(
    accountId: string,
    entry: ParsedStatementEntry,
    occurrences: Map<string, number>,
  ): string {
    const day = entry.occurredAt.toISOString().slice(0, 10);
    // Normaliza o estabelecimento para que espaco ou acento a mais no export
    // de um mes nao gere identidade diferente do mes anterior.
    const merchant = normalizeMerchant(entry.merchant);
    const group = `csv:${accountId}:${day}:${merchant}:${entry.amount.cents}`;

    const seen = occurrences.get(group) ?? 0;
    occurrences.set(group, seen + 1);

    return `${group}:${seen}`;
  }
}
