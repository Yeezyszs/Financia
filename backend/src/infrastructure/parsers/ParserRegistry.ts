import type { AccountType, Institution } from '../../domain/entities/Account.js';
import type {
  StatementParser,
  StatementParserRegistry,
} from '../../application/ports/parsers/StatementParser.js';
import { NubankCheckingParser } from './nubank/NubankCheckingParser.js';
import { NubankCreditCardParser } from './nubank/NubankCreditCardParser.js';

/**
 * Registro dos adapters de ingestão. O C6 entra aqui como mais uma linha
 * quando houver export real — nenhum caso de uso muda.
 */
export class ParserRegistry implements StatementParserRegistry {
  private readonly parsers: StatementParser[] = [
    new NubankCheckingParser(),
    new NubankCreditCardParser(),
  ];

  resolve(institution: Institution, accountType: AccountType): StatementParser | null {
    return (
      this.parsers.find((p) => p.institution === institution && p.accountType === accountType) ??
      null
    );
  }

  /**
   * Detecção pelo conteúdo é só um fallback: extrato e fatura do Nubank
   * têm exatamente o mesmo cabeçalho, e o que separa os dois é o sinal do
   * valor. Quem decide de verdade é o tipo da conta escolhida no upload.
   */
  detect(content: string): StatementParser | null {
    return this.parsers.find((parser) => parser.supports(content)) ?? null;
  }
}
