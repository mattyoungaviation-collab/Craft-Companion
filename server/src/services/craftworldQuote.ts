const craftWorldBaseUrl = process.env.CRAFTWORLD_BASE_URL || 'https://craft-world.gg';
const craftWorldGraphqlUrl = process.env.CRAFTWORLD_GRAPHQL_ENDPOINT || `${craftWorldBaseUrl}/graphql`;

export type CraftworldExactInputQuote = {
  type: string;
  input: {
    symbol: string;
    amount: number;
  };
  output: {
    symbol: string;
    amount: number;
  };
  details?: {
    priceImpactPercentage?: number;
  };
};

function normalizeCraftworldToken(token?: string) {
  const value = String(token || '').trim();
  if (!value) return '';
  if (value.startsWith('jwt_')) return value;
  if (value.split('.').length >= 3) return `jwt_${value}`;
  return value;
}

function craftWorldHeaders(token?: string) {
  const normalizedToken = normalizeCraftworldToken(token);
  return {
    'Content-Type': 'application/json',
    Accept: '*/*',
    Origin: 'https://craft-world.gg',
    Referer: 'https://craft-world.gg/',
    'x-app-version': process.env.CRAFTWORLD_APP_VERSION || '1.10.1',
    ...(normalizedToken ? { Authorization: `Bearer ${normalizedToken}` } : {}),
  };
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let raw: any;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    const preview = text.slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(`Expected JSON from ${res.url}, received: ${preview}`);
  }

  if (!res.ok) throw new Error(raw?.message || raw?.error?.message || 'Craft World quote request failed.');
  if (raw.errors?.length) throw new Error(raw.errors[0]?.message || 'Craft World quote GraphQL error.');
  return raw.data as T;
}

export async function getCraftworldExactInputQuote(input: {
  inputSymbol: string;
  outputSymbol?: string;
  inputAmount: number;
}, token?: string): Promise<CraftworldExactInputQuote> {
  const inputSymbol = String(input.inputSymbol || '').trim().toUpperCase();
  const outputSymbol = String(input.outputSymbol || 'COIN').trim().toUpperCase();
  const inputAmount = Number(input.inputAmount || 0);

  if (!inputSymbol) throw new Error('Input symbol is required.');
  if (!Number.isFinite(inputAmount) || inputAmount <= 0) throw new Error('Input amount must be greater than zero.');

  if (inputSymbol === outputSymbol) {
    return {
      type: 'EXACT_INPUT',
      input: { symbol: inputSymbol, amount: inputAmount },
      output: { symbol: outputSymbol, amount: inputAmount },
      details: { priceImpactPercentage: 0 },
    };
  }

  const query = `
    query exactInputQuoteQuery($input: ExactInputInput!) {
      exactInputQuote(input: $input) {
        type
        input {
          symbol
          amount
        }
        output {
          symbol
          amount
        }
        details {
          priceImpactPercentage
        }
      }
    }
  `;

  const data = await fetch(craftWorldGraphqlUrl, {
    method: 'POST',
    headers: craftWorldHeaders(token),
    body: JSON.stringify({
      query,
      variables: {
        input: {
          inputSymbol,
          outputSymbol,
          inputAmount,
        },
      },
    }),
  }).then((res) => readJson<{ exactInputQuote?: CraftworldExactInputQuote }>(res));

  if (!data.exactInputQuote) throw new Error('Craft World quote was not returned.');
  return data.exactInputQuote;
}
