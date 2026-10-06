import type { AccountType, Institution } from '../../../domain/entities/Account.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import { Money } from '../../../domain/value-objects/Money.js';
import type {
  ParsedStatement,
  ParsedTransactionRow,
  StatementParser,
} from '../../../application/ports/parsers/StatementParser.js';
import { columnIndex, detectDelimiter, parseCsvRows } from './CsvReader.js';
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
  /**
   * Bancos que publicam entrada e saída em colunas separadas, em vez de
   * um valor com sinal. O extrato do C6 é assim: `Entrada(R$)` e
   * `Saída(R$)`, uma zerada em cada linha. Usadas só quando não existe
   * coluna de valor única.
   */
  inflowColumns?: string[];
  outflowColumns?: string[];
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
/** Até onde procurar o cabeçalho antes de desistir. */
const PREAMBULO_MAXIMO = 15;

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
      const rawInflow = celula(at.inflow);
      const rawOutflow = celula(at.outflow);

      // Linha em branco no fim do arquivo: ignora em silêncio.
      if (!rawDate && !rawDescription && !rawAmount && !rawInflow && !rawOutflow) return;

      const lineNumber = index + 2; // +1 do cabeçalho, +1 para virar 1-based
      if (!rawDate || (!rawAmount && !rawInflow && !rawOutflow)) {
        throw new DomainError(`Linha ${lineNumber}: data ou valor ausente`, 'INVALID_ROW');
      }

      // Entrada e saída em colunas separadas viram um valor com sinal,
      // que é como o domínio inteiro pensa. A linha preenche uma e zera
      // a outra, então subtrair dá o sinal certo sem olhar para rótulo.
      const amount =
        at.amount === -1
          ? Money.fromCents(
              (rawInflow ? Money.fromDecimalString(rawInflow).cents : 0) -
                (rawOutflow ? Money.fromDecimalString(rawOutflow).cents : 0),
            )
          : Money.fromDecimalString(rawAmount);

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
        // `invertSign` vale para fatura, onde a compra é publicada
        // positiva. Com entrada/saída o sinal já saiu da subtração.
        amountCents: this.layout.invertSign && at.amount !== -1 ? -amount.cents : amount.cents,
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

  /**
   * Procura o cabeçalho, que nem sempre é a primeira linha.
   *
   * O extrato do C6 abre com o nome do banco, a agência, a data de
   * geração e o período — cinco linhas antes do cabeçalho de verdade.
   * Fixar "cabeçalho é a linha 1" fazia o parser reclamar de um arquivo
   * perfeitamente válido, dizendo que a única coluna encontrada era
   * "EXTRATO DE CONTA CORRENTE C6 BANK".
   *
   * O limite de linhas é proposital: passar disso é varrer dados em
   * busca de cabeçalho, e aí qualquer coisa vira qualquer coisa.
   */
  private locateColumns(
    content: string,
  ):
    | { ok: true; header: string[]; rows: string[][]; at: ColumnPositions }
    | { ok: false; header: string[] } {
    const linhas = parseCsvRows(content, detectDelimiter(content));
    const limite = Math.min(linhas.length, PREAMBULO_MAXIMO);

    // Guardado para a mensagem de erro: o melhor palpite de cabeçalho é
    // o que mais se parece com um, e não a primeira linha do arquivo.
    let melhorPalpite: { header: string[]; acertos: number } = { header: [], acertos: -1 };

    for (let i = 0; i < limite; i += 1) {
      const header = (linhas[i] ?? []).map((celula) => celula.trim());

      const date = columnIndex(header, this.layout.dateColumns);
      const description = columnIndex(header, this.layout.descriptionColumns);
      const amount = columnIndex(header, this.layout.amountColumns);
      const inflow = columnIndex(header, this.layout.inflowColumns ?? []);
      const outflow = columnIndex(header, this.layout.outflowColumns ?? []);

      // Valor único ou o par entrada/saída: um dos dois tem que existir.
      const temValor = amount !== -1 || (inflow !== -1 && outflow !== -1);
      const acertos = [date !== -1, description !== -1, temValor].filter(Boolean).length;
      if (acertos > melhorPalpite.acertos) melhorPalpite = { header, acertos };

      if (date === -1 || description === -1 || !temValor) continue;

      const extras: Record<string, number> = {};
      for (const [nome, apelidos] of Object.entries(this.layout.extraColumns ?? {})) {
        const posicao = columnIndex(header, apelidos);
        if (posicao !== -1) extras[nome] = posicao;
      }

      return {
        ok: true,
        header,
        rows: linhas.slice(i + 1),
        at: {
          date,
          description,
          amount,
          inflow,
          outflow,
          installment: columnIndex(header, this.layout.installmentColumns ?? []),
          extras,
        },
      };
    }

    return { ok: false, header: melhorPalpite.header };
  }
}

interface ColumnPositions {
  date: number;
  description: number;
  /** -1 quando o banco separa entrada e saída em duas colunas. */
  amount: number;
  inflow: number;
  outflow: number;
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
