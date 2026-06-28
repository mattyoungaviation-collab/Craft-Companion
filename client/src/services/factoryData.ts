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
  '/data/Game%20Data%20-%20Factories%20-%20rev.%20v_01%20%2Bevents%20(2)%20(1).csv',
  '/data/factories.csv',
];

let factoryDataCache: FactoryDataRow[] | null = null;

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null) return fallback;

  const cleaned = String(value)
    .trim()
    .replace(/,/g, '')
    .replace(/%/g, '');

  if (!cleaned) return fallback;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseToken(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
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

function getFirst(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const normalizedKey = normalizeHeader(key);
    const value = row[normalizedKey];

    if (value !== undefined && String(value).trim() !== '') {
      return value;
    }
  }

  return '';
}

function parseFactoryCsv(csv: string): FactoryDataRow[] {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());

  const [headerLine, ...dataLines] = lines;

  if (!headerLine) return [];

  const headers = parseCsvLine(headerLine).map(normalizeHeader);

  const rows = dataLines
    .map((line, lineIndex) => {
      const values = parseCsvLine(line);

      const row = headers.reduce<Record<string, string>>((acc, header, index) => {
        acc[header] = values[index] ?? '';
        return acc;
      }, {});

      const parsedRow: FactoryDataRow = {
        token: parseToken(
          getFirst(row, [
            'token',
            'factory',
            'factory_token',
            'resource',
            'resource_token',
            'input',
            'name',
          ]),
        ),

        level: parseNumber(
          getFirst(row, [
            'level',
            'factory_level',
            'lvl',
          ]),
          1,
        ),

        duration_min: parseNumber(
          getFirst(row, [
            'duration_min',
            'duration',
            'runtime',
            'runtime_min',
            'time',
            'time_min',
            'craft_time',
            'craft_time_min',
          ]),
        ),

        output_token: parseToken(
          getFirst(row, [
            'output_token',
            'output',
            'produces',
            'result',
            'result_token',
          ]),
        ),

        output_amount: parseNumber(
          getFirst(row, [
            'output_amount',
            'output_qty',
            'output_quantity',
            'amount',
            'produces_amount',
            'result_amount',
          ]),
        ),

        input_token_1: parseToken(
          getFirst(row, [
            'input_token_1',
            'input_1',
            'ingredient_1',
            'ingredient_token_1',
            'cost_token_1',
          ]),
        ),

        input_amount_1: parseNumber(
          getFirst(row, [
            'input_amount_1',
            'input_1_amount',
            'ingredient_1_amount',
            'cost_amount_1',
          ]),
        ),

        input_token_2: parseToken(
          getFirst(row, [
            'input_token_2',
            'input_2',
            'ingredient_2',
            'ingredient_token_2',
            'cost_token_2',
          ]),
        ),

        input_amount_2: parseNumber(
          getFirst(row, [
            'input_amount_2',
            'input_2_amount',
            'ingredient_2_amount',
            'cost_amount_2',
          ]),
        ),

        upgrade_token: parseToken(
          getFirst(row, [
            'upgrade_token',
            'upgrade',
            'upgrade_resource',
            'upgrade_cost_token',
          ]),
        ),

        upgrade_amount: parseNumber(
          getFirst(row, [
            'upgrade_amount',
            'upgrade_cost',
            'upgrade_cost_amount',
          ]),
        ),
      };

      if (!parsedRow.token && !parsedRow.output_token) {
        if (import.meta.env.DEV) {
          console.warn('Skipping malformed factory CSV row with no token/output token', {
            line: lineIndex + 2,
            row,
          });
        }

        return null;
      }

      return parsedRow;
    })
    .filter((row): row is FactoryDataRow => row !== null);

  if (import.meta.env.DEV) {
    console.info(`Parsed ${rows.length} factory CSV rows`);
    console.info('Factory CSV sample row:', rows[0]);
  }

  return rows;
}

export async function loadFactoryData() {
  if (factoryDataCache) return factoryDataCache;

  let lastError: unknown;

  for (const path of csvPaths) {
    try {
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error(`Factory CSV request failed: ${response.status}`);
      }

      const csv = await response.text();
      const parsed = parseFactoryCsv(csv);

      if (import.meta.env.DEV) {
        console.info(`Factory CSV path tried: ${path}`);
        console.info(`Factory CSV rows parsed from ${path}: ${parsed.length}`);
      }

      if (parsed.length === 0) {
        lastError = new Error(`Factory CSV parsed 0 rows from ${path}`);
        continue;
      }

      factoryDataCache = parsed;
      return factoryDataCache;
    } catch (error) {
      lastError = error;

      if (import.meta.env.DEV) {
        console.warn(`Factory CSV load failed for ${path}`, error);
      }
    }
  }

  console.error('Unable to load factory CSV data', lastError);
  factoryDataCache = [];
  return factoryDataCache;
}

function normalizeFactoryToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
}
export async function getFactoryLevelData(token: unknown, level: number) {
  const rows = await loadFactoryData();
  const normalizedToken = normalizeFactoryToken(token);

  return (
    rows.find((row) => {
      return (
        normalizeFactoryToken(row.token) === normalizedToken &&
        row.level === level
      );
    }) || null
  );
}

export async function getFactoryLevelsByToken(token: unknown) {
  const rows = await loadFactoryData();
  const normalizedToken = normalizeFactoryToken(token);

  return rows
    .filter((row) => normalizeFactoryToken(row.token) === normalizedToken)
    .sort((a, b) => a.level - b.level);
}