import type { StatementTable } from '../../../application/ports/StatementParser';

/**
 * Leitor de CSV que aguenta o que banco brasileiro exporta de verdade:
 * separador virgula ou ponto-e-virgula (Excel pt-BR usa ";"), campo entre
 * aspas com separador dentro, aspas escapadas por duplicacao, e BOM no comeco
 * do arquivo, que o Excel adora colocar e que faz a primeira coluna do
 * cabecalho nunca casar com nada.
 */
export function readCsv(content: string): StatementTable {
  const clean = content.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiter = detectDelimiter(clean);

  const rows = clean
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => splitLine(line, delimiter));

  const headers = rows.shift() ?? [];
  return { headers: headers.map((h) => h.trim()), rows };
}

/**
 * Escolhe o separador pela consistencia entre linhas, nao pela contagem bruta.
 * Contar so a frequencia erra quando o texto das descricoes tem virgulas:
 * "IFOOD, SAO PAULO" num arquivo separado por ponto-e-virgula.
 */
function detectDelimiter(content: string): string {
  const sample = content.split('\n').filter((l) => l.trim() !== '').slice(0, 10);
  if (sample.length === 0) return ',';

  let best = ',';
  let bestScore = -1;

  for (const candidate of [';', ',', '\t', '|']) {
    const counts = sample.map((line) => splitLine(line, candidate).length);
    const first = counts[0] ?? 0;
    if (first < 2) continue;

    // Consistente = todas as linhas com o mesmo numero de colunas.
    const consistent = counts.every((c) => c === first);
    const score = (consistent ? 100 : 0) + first;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      // Aspas duplicadas dentro de campo com aspas representam uma aspa literal.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields.map((f) => f.trim());
}
