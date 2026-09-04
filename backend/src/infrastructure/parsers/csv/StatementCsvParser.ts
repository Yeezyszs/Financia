import type { AccountType, Institution } from '../../../domain/entities/Account.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import { Money } from '../../../domain/value-objects/Money.js';
import type {
  ParsedStatement,
  ParsedTransactionRow,
  StatementParser,
} from '../../../application/ports/parsers/StatementParser.js';
import { columnIndex, detectDelimiter, parseCsv } from './CsvReader.js';
import { parseStatementDate } from './parseDate.js';

export interface StatementLayout {
  institution: Institution;
  accountType: AccountType;
  /** Nome legível, usado na mensagem de erro quando o CSV não bate. */
  label: string;
  dateColumns: string[];
  descriptionColumns: string[];
  /**
   * Ordem importa: o primeiro apelido que casar vence. Em faturas com
   * `Valor (em US$)` e `Valor (em R$)` lado a lado, a coluna em reais
   * precisa vir primeiro, senão importaríamos dólar como se fosse real.
   */
  amountColumns: string[];
  /** Colunas guardadas em `raw` para auditoria, sem uso no dedupe. */
  extraColumns?: Record<string, string[]>;
  /**
   * Em fatura, o valor publicado é o quanto foi *cobrado*: compra vem
   * positiva. O domínio assume "negativo = saída", então o sinal é
   * invertido na entrada.
   */
  invertSign?: boolean;
  /** Coluna de parcela ("2/12"), anexada à descrição quando existe. */
  installmentColumns?: string[];
}

/**
 * Um parser de CSV bancário, configurado por layout.
 *
 * Os quatro layouts suportados hoje diferem só em nome de coluna e
 * convenção de sinal — o resto (aspas, delimitador, formato de data e de
 * valor, linha em branco no fim) é o mesmo problema. Uma classe por banco
 * seria a mesma lógica copiada quatro vezes, e correção de bug em uma
 * cópia não chega nas outras.
 */
export class StatementCsvParser implements StatementParser {
  readonly institution: Institution;
  readonly accountType: AccountType;

  constructor(private readonly layout: StatementLayout) {
    this.institution = layout.institution;
    this.accountType = layout.accountType;
  }

  supports(content: string): boolean {
    try {
      return this.locateColumns(content).ok;
    } catch {
      return false;
    }
  }

  parse(content: string): ParsedStatement {
    const localizacao = this.locateColumns(content);

    if (!localizacao.ok) {
      throw new DomainError(
        `CSV não parece ${this.layout.label}. Colunas encontradas: ${localizacao.header.join(', ')}`,
        'UNSUPPORTED_STATEMENT',
      );
    }

    const { rows, at } = localizacao;
    const parsed: ParsedTransactionRow[] = [];

    rows.forEach((row, index) => {
      const celula = (posicao: number) => (posicao === -1 ? '' : (row[posicao]?.trim() ?? ''));

      const rawDate = celula(at.date);
      const rawDescription = celula(at.description);
      const rawAmount = celula(at.amount);

      // Linha em branco no fim do arquivo: ignora em silêncio.
      if (!rawDate && !rawDescription && !rawAmount) return;

      const lineNumber = index + 2; // +1 do cabeçalho, +1 para virar 1-based
      if (!rawDate || !rawAmount) {
        throw new DomainError(`Linha ${lineNumber}: data ou valor ausente`, 'INVALID_ROW');
      }

      const amount = Money.fromDecimalString(rawAmount);
      if (amount.cents === 0) return; // estorno de valor zero não vira transação

      const raw: Record<string, string> = {};
      for (const [nome, posicao] of Object.entries(at.extras)) {
        const valor = celula(posicao);
        if (valor) raw[nome] = valor;
      }

      const parcela = celula(at.installment);

      parsed.push({
        occurredOn: parseStatementDate(rawDate),
        description: descricaoCom(rawDescription, parcela),
        amountCents: this.layout.invertSign ? -amount.cents : amount.cents,
        ...(Object.keys(raw).length > 0 ? { raw } : {}),
      });
    });

    const dates = parsed.map((row) => row.occurredOn).sort();

    return {
      rows: parsed,
      periodStart: dates[0] ?? null,
      periodEnd: dates[dates.length - 1] ?? null,
    };
  }

  private locateColumns(
    content: string,
  ):
    | { ok: true; header: string[]; rows: string[][]; at: ColumnPositions }
    | { ok: false; header: string[] } {
    const { header, rows } = parseCsv(content, detectDelimiter(content));

    const date = columnIndex(header, this.layout.dateColumns);
    const description = columnIndex(header, this.layout.descriptionColumns);
    const amount = columnIndex(header, this.layout.amountColumns);

    if (date === -1 || description === -1 || amount === -1) return { ok: false, header };

    const extras: Record<string, number> = {};
    for (const [nome, apelidos] of Object.entries(this.layout.extraColumns ?? {})) {
      const posicao = columnIndex(header, apelidos);
      if (posicao !== -1) extras[nome] = posicao;
    }

    return {
      ok: true,
      header,
      rows,
      at: {
        date,
        description,
        amount,
        installment: columnIndex(header, this.layout.installmentColumns ?? []),
        extras,
      },
    };
  }
}

interface ColumnPositions {
  date: number;
  description: number;
  amount: number;
  installment: number;
  extras: Record<string, number>;
}

/**
 * Anexa a parcela à descrição quando o banco a publica em coluna própria.
 *
 * Sem isso, "NETFLIX" de janeiro e de fevereiro ficam indistinguíveis na
 * tela — e a informação mais útil da fatura parcelada (quantas faltam)
 * se perde. O agrupamento por estabelecimento continua funcionando: a
 * chave descarta o "2 12" do fim.
 */
function descricaoCom(descricao: string, parcela: string): string {
  const base = descricao || 'Sem descrição';
  if (!parcela) return base;

  const normalizada = parcela.toLowerCase();
  const parcelaUnica = normalizada === 'unica' || normalizada === 'única' || normalizada === '-';
  if (parcelaUnica || !/\d/.test(parcela)) return base;

  return `${base} (${parcela})`;
}
