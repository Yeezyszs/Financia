import { Import } from '../../../domain/entities/Import.js';
import { Transaction } from '../../../domain/entities/Transaction.js';
import { DomainError, NotFoundError } from '../../../domain/errors/DomainError.js';
import { Money } from '../../../domain/value-objects/Money.js';
import {
  assignOrdinals,
  buildFingerprint,
  normalizeDescription,
} from '../../../domain/value-objects/TransactionFingerprint.js';
import type { StatementParserRegistry } from '../../ports/parsers/StatementParser.js';
import type { AccountRepository } from '../../ports/repositories/AccountRepository.js';
import type { CategoryRepository } from '../../ports/repositories/CategoryRepository.js';
import type { CategoryRuleRepository } from '../../ports/repositories/CategoryRuleRepository.js';
import type { ImportRepository } from '../../ports/repositories/ImportRepository.js';
import type { TransactionRepository } from '../../ports/repositories/TransactionRepository.js';
import type { Hasher } from '../../ports/services/Hasher.js';
import type { IdGenerator } from '../../ports/services/IdGenerator.js';
import { RuleBasedCategorizer } from '../../services/RuleBasedCategorizer.js';

export interface ImportStatementInput {
  userId: string;
  accountId: string;
  filename: string;
  /** Conteúdo do CSV como texto. */
  content: string;
  /** Reimportar o mesmo arquivo de propósito (o dedupe por linha continua valendo). */
  force?: boolean;
}

export interface ImportStatementOutput {
  importId: string;
  rowsTotal: number;
  rowsImported: number;
  rowsDuplicated: number;
  categorized: number;
  periodStart: string | null;
  periodEnd: string | null;
}

/**
 * Fluxo completo da ingestão:
 *   arquivo -> parser do banco -> fingerprint por linha -> descarte do
 *   que já existe -> categorização por regras -> insert -> log de import.
 *
 * Duas barreiras contra duplicata, de propósito:
 *   1. hash do arquivo inteiro, que pega "importei esse extrato de novo";
 *   2. fingerprint por linha, que pega a sobreposição de períodos entre
 *      dois arquivos diferentes (o caso comum de quem importa toda semana).
 */
export class ImportStatementUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly imports: ImportRepository,
    private readonly transactions: TransactionRepository,
    private readonly categories: CategoryRepository,
    private readonly rules: CategoryRuleRepository,
    private readonly parsers: StatementParserRegistry,
    private readonly ids: IdGenerator,
    private readonly hasher: Hasher,
  ) {}

  async execute(input: ImportStatementInput): Promise<ImportStatementOutput> {
    const account = await this.accounts.findById(input.userId, input.accountId);
    if (!account) throw new NotFoundError('Conta', input.accountId);

    const fileHash = this.hasher.hash(input.content);

    const previous = await this.imports.findByFileHash(input.userId, account.id, fileHash);
    if (previous && !input.force) {
      throw new DomainError(
        `Esse arquivo já foi importado em ${previous.toJSON().createdAt.toISOString().slice(0, 10)} (${previous.rowsImported} transações). Use force para importar de novo.`,
        'FILE_ALREADY_IMPORTED',
      );
    }

    const parser = this.parsers.resolve(account.institution, account.type);
    if (!parser) {
      throw new DomainError(
        `Ainda não há parser para ${account.institution} / ${account.type}`,
        'PARSER_NOT_AVAILABLE',
      );
    }

    const record = new Import({
      id: this.ids.generate(),
      userId: input.userId,
      accountId: account.id,
      filename: input.filename,
      fileHash,
      status: 'pending',
      rowsTotal: 0,
      rowsImported: 0,
      rowsDuplicated: 0,
      periodStart: null,
      periodEnd: null,
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    });

    // Um import só é criado quando não é reimportação; no force, reusamos
    // o registro anterior para não violar o unique de file_hash.
    const saved = previous ? previous : await this.imports.create(record);

    try {
      const statement = parser.parse(input.content);

      // Ordinal separa compras idênticas no mesmo dia dentro deste arquivo.
      const ordinals = assignOrdinals(statement.rows, (row) =>
        [row.occurredOn, normalizeDescription(row.description), row.amountCents].join('|'),
      );

      const fingerprints = statement.rows.map((row, index) =>
        buildFingerprint({
          accountId: account.id,
          occurredOn: row.occurredOn,
          description: row.description,
          amountCents: row.amountCents,
          ordinal: ordinals[index]!,
        }),
      );

      const existing = await this.transactions.findExistingFingerprints(input.userId, fingerprints);

      const [ruleList, categoryList] = await Promise.all([
        this.rules.listActiveByUser(input.userId),
        this.categories.listByUser(input.userId),
      ]);
      const categorizer = new RuleBasedCategorizer(ruleList, categoryList);

      const toInsert: Transaction[] = [];
      const usedRuleIds: string[] = [];
      let duplicated = 0;

      statement.rows.forEach((row, index) => {
        if (existing.has(fingerprints[index]!)) {
          duplicated += 1;
          return;
        }

        const match = categorizer.categorize({
          description: row.description,
          accountId: account.id,
        });

        // Categoria de transferência (ex: pagamento de fatura) marca a
        // transação como transferência: ela some de receitas e despesas.
        const isTransfer = match?.category.kind === 'transfer';

        toInsert.push(
          Transaction.create({
            id: this.ids.generate(),
            userId: input.userId,
            accountId: account.id,
            importId: saved.id,
            occurredOn: row.occurredOn,
            description: row.description,
            amount: Money.fromCents(row.amountCents),
            ordinal: ordinals[index]!,
            categoryId: match?.category.id ?? null,
            categorizedBy: match ? 'rule' : 'uncategorized',
            appliedRuleId: match?.ruleId ?? null,
            source: 'import',
            isTransfer,
          }),
        );

        if (match) usedRuleIds.push(match.ruleId);
      });

      await this.transactions.createMany(toInsert);
      if (usedRuleIds.length > 0) await this.rules.incrementHits(usedRuleIds);

      const completed = saved.complete({
        rowsTotal: statement.rows.length,
        rowsImported: toInsert.length,
        rowsDuplicated: duplicated,
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
      });
      await this.imports.update(completed);

      return {
        importId: saved.id,
        rowsTotal: statement.rows.length,
        rowsImported: toInsert.length,
        rowsDuplicated: duplicated,
        categorized: usedRuleIds.length,
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
      };
    } catch (error) {
      // O log de importação registra a falha — a tela de Histórico precisa
      // mostrar o que deu errado, não só o que deu certo.
      const message = error instanceof Error ? error.message : 'Falha desconhecida na importação';
      await this.imports.update(saved.fail(message));
      throw error;
    }
  }
}
