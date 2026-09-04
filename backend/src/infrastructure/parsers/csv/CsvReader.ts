/**
 * Leitor de CSV mínimo porém correto: respeita aspas, vírgula dentro de
 * campo entre aspas, aspas escapadas ("") e CRLF. Não vale trazer uma
 * dependência para isso — o que os bancos exportam é CSV simples.
 */
export interface CsvTable {
  header: string[];
  rows: string[][];
}

export function parseCsv(content: string, delimiter = ','): CsvTable {
  const withoutBom = content.replace(/^\ufeff/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < withoutBom.length; i += 1) {
    const char = withoutBom[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (withoutBom[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  const [header = [], ...body] = nonEmpty;

  return { header: header.map((h) => h.trim()), rows: body };
}

/** Detecta o separador olhando a primeira linha (alguns exports usam ;). */
export function detectDelimiter(content: string): ',' | ';' {
  const firstLine = content.split('\n', 1)[0] ?? '';
  return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
}

/**
 * Índice de uma coluna aceitando variações de nome, acento, caixa e
 * pontuação — "Valor (em R$)" e "valor em r" são a mesma coluna.
 *
 * A ordem dos candidatos decide o desempate: numa fatura com `Valor (em
 * US$)` e `Valor (em R$)` lado a lado, quem pedir "valor em r" antes de
 * "valor" pega a coluna certa. E um candidato genérico não casa com o
 * cabeçalho específico, então, na falta da coluna em reais, o parser
 * falha em vez de importar dólar como se fosse real.
 */
export function columnIndex(header: string[], candidates: string[]): number {
  const normalized = header.map(normalizeHeader);

  for (const candidate of candidates) {
    const index = normalized.indexOf(normalizeHeader(candidate));
    if (index !== -1) return index;
  }
  return -1;
}

function normalizeHeader(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
