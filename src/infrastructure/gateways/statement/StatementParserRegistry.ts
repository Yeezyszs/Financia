import type {
  StatementParser,
  StatementParserRegistry,
  StatementTable,
} from '../../../application/ports/StatementParser';
import { GenericStatementParser } from './parsers/GenericStatementParser';

/**
 * Escolhe o parser pela confianca que cada um declara sobre o arquivo.
 *
 * Diferente do registry de e-mail, que resolve por chave: la a fonte diz qual
 * banco e; aqui o arquivo chega solto, sem rotulo, e o formato precisa ser
 * reconhecido. Sempre ha resposta, porque o generico aceita qualquer tabela
 * com data, valor e descricao.
 */
export class ConfidenceParserRegistry implements StatementParserRegistry {
  private readonly fallback = new GenericStatementParser();

  constructor(private readonly parsers: StatementParser[]) {}

  resolve(table: StatementTable): StatementParser {
    const ranked = this.parsers
      .map((parser) => ({ parser, score: parser.confidence(table) }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    return best && best.score >= 0.5 ? best.parser : this.fallback;
  }
}
