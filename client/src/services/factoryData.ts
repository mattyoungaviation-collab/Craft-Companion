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

const csvPaths = [
  '/data/factories.csv',
  '/data/Game%20Data%20-%20Factories%20-%20rev.%20v_01%20%2Bevents%20(2)%20(1).csv',
  '/client/public/Game%20Data%20-%20Factories%20-%20rev.%20v_01%20%2Bevents%20(2).csv',
];

let factoryDataCache: FactoryDataRow[] | null = null;

function parseNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
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
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseFactoryCsv(csv: string): FactoryDataRow[] {
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

export async function loadFactoryData() {
  if (factoryDataCache) return factoryDataCache;

  let lastError: unknown;
  for (const path of csvPaths) {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Factory CSV request failed: ${response.status}`);
      const csv = await response.text();
      factoryDataCache = parseFactoryCsv(csv);
      return factoryDataCache;
    } catch (error) {
      lastError = error;
    }
  }

  console.error('Unable to load factory CSV data', lastError);
  factoryDataCache = [];
  return factoryDataCache;
}

export async function getFactoryLevelData(token: string, level: number) {
  const rows = await loadFactoryData();
  const normalizedToken = token.trim().toUpperCase();
  return rows.find((row) => row.token === normalizedToken && row.level === level) || null;
}

export async function getFactoryLevelsByToken(token: string) {
  const rows = await loadFactoryData();
  const normalizedToken = token.trim().toUpperCase();
  return rows.filter((row) => row.token === normalizedToken).sort((a, b) => a.level - b.level);
}
