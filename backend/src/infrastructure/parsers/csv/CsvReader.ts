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

/** Índice de uma coluna aceitando variações de nome/acento/caixa. */
export function columnIndex(header: string[], candidates: string[]): number {
  const normalized = header.map((h) =>
    h
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim(),
  );
  for (const candidate of candidates) {
    const index = normalized.indexOf(candidate);
    if (index !== -1) return index;
  }
  return -1;
}
