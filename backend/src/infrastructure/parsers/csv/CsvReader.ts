/**
 * Leitor de CSV mínimo porém correto: respeita aspas, vírgula dentro de
 * campo entre aspas, aspas escapadas ("") e CRLF. Não vale trazer uma
 * dependência para isso — o que os bancos exportam é CSV simples.
 */
export interface CsvTable {
  header: string[];
  rows: string[][];
}

/**
 * Todas as linhas com conteúdo, sem decidir qual é o cabeçalho.
 *
 * Quem decide é o parser, porque nem todo banco começa o arquivo pelo
 * cabeçalho: o extrato do C6 abre com título, agência, data de geração
 * e período, e só na sétima linha útil vem "Data Lançamento,...".
 */
export function parseCsvRows(content: string, delimiter = ','): string[][] {
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

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export function parseCsv(content: string, delimiter = ','): CsvTable {
  const [header = [], ...body] = parseCsvRows(content, delimiter);
  return { header: header.map((h) => h.trim()), rows: body };
}

/**
 * Detecta o separador (alguns exports usam ;) olhando o arquivo inteiro,
 * e não a primeira linha: o extrato do C6 começa com "EXTRATO DE CONTA
 * CORRENTE C6 BANK", uma linha sem separador nenhum, que não decide nada.
 */
export function detectDelimiter(content: string): ',' | ';' {
  const virgulas = content.match(/,/g)?.length ?? 0;
  const pontoEVirgula = content.match(/;/g)?.length ?? 0;
  return pontoEVirgula > virgulas ? ';' : ',';
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
