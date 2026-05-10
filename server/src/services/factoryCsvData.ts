import { promises as fs } from 'node:fs';
import path from 'node:path';

export type FactoryDataRow = {
  token: string;
  level: number;
  duration_min: number;
  output_token: string;
  output_amount: number;
  input_token_1: string;
  input_amount_1: number;
  input_token_2: string;
  input_amount_2: number;
  upgrade_token: string;
  upgrade_amount: number;
};

const csvFiles = [
  path.resolve(process.cwd(), 'client/public/data/factories.csv'),
  path.resolve(process.cwd(), 'client/public/data/Game Data - Factories - rev. v_01 +events (2) (1).csv'),
  path.resolve(process.cwd(), 'client/public/client/public/Game Data - Factories - rev. v_01 +events (2).csv'),
];

let cache: FactoryDataRow[] | null = null;

function parseNumber(value: string) {
  const parsed = Number(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function parseCsv(csv: string) {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  const [headerLine, ...dataLines] = lines;
  const headers = parseCsvLine(headerLine).map((header) => header.trim());

  return dataLines.map((line) => {
    const values = parseCsvLine(line);
    const row = headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = values[index] || '';
      return acc;
    }, {});

    return {
      token: row.token?.trim().toUpperCase() || '',
      level: parseNumber(row.level),
      duration_min: parseNumber(row.duration_min),
      output_token: row.output_token?.trim().toUpperCase() || '',
      output_amount: parseNumber(row.output_amount),
      input_token_1: row.input_token_1?.trim().toUpperCase() || '',
      input_amount_1: parseNumber(row.input_amount_1),
      input_token_2: row.input_token_2?.trim().toUpperCase() || '',
      input_amount_2: parseNumber(row.input_amount_2),
      upgrade_token: row.upgrade_token?.trim().toUpperCase() || '',
      upgrade_amount: parseNumber(row.upgrade_amount),
    };
  });
}

export async function loadFactoryCsvData() {
  if (cache) return cache;

  for (const file of csvFiles) {
    try {
      const csv = await fs.readFile(file, 'utf-8');
      cache = parseCsv(csv);
      return cache;
    } catch {
      // try next path
    }
  }

  cache = [];
  return cache;
}
