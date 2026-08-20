import type { EmailParser, EmailParserRegistry } from '../../../application/ports/EmailParser.js';

/**
 * Registry dos parsers. E o unico lugar que precisa mudar quando entra um
 * banco novo - o dominio e os use cases seguem intocados.
 */
export class InMemoryParserRegistry implements EmailParserRegistry {
  private readonly byStrategy: Map<string, EmailParser>;

  constructor(parsers: EmailParser[]) {
    this.byStrategy = new Map(parsers.map((p) => [p.institution, p]));
  }

  has(parserStrategy: string): boolean {
    return this.byStrategy.has(parserStrategy);
  }

  resolve(parserStrategy: string): EmailParser {
    const parser = this.byStrategy.get(parserStrategy);
    if (!parser) {
      // Fonte cadastrada apontando para parser inexistente e erro de config,
      // nao de dado. Falhar alto aqui evita e-mail sumindo em silencio.
      throw new Error(
        `Nenhum parser registrado para "${parserStrategy}". Registrados: ${[...this.byStrategy.keys()].join(', ') || '(nenhum)'}`,
      );
    }
    return parser;
  }
}
