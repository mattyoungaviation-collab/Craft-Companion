import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { getCraftworldQuote } from '../services/api';
import { loadFactoryData, type FactoryDataRow } from '../services/factoryData';
import { enqueueQuoteRequest } from '../utils/rateLimit';

type Quote = {
  input: { symbol: string; amount: number };
  output: { symbol: string; amount: number };
  details?: { priceImpactPercentage?: number };
};

type MatrixCell = {
  row: FactoryDataRow;
  inputBuyCost: number;
  outputSellValue: number;
  returnPercent: number;
  priceImpactPercentage: number;
  isComplete: boolean;
};

const tokenOrder = [
  'MUD',
  'CLAY',
  'SAND',
  'COPPER',
  'STEEL',
  'SCREWS',
  'SEAWATER',
  'HEAT',
  'ALGAE',
  'LAVA',
  'OXYGEN',
  'GAS',
  'FUEL',
  'OIL',
  'GLASS',
  'SULFUR',
  'FIBERGLASS',
  'STEAM',
  'CERAMICS',
  'STONE',
  'CEMENT',
  'ACID',
  'PLASTICS',
  'ENERGY',
  'HYDROGEN',
  'DYNAMITE',
];

function formatNumber(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0';
}

function quoteKey(symbol: string, amount: number) {
  return `${symbol.toUpperCase()}-${amount}`;
}

function getCellClass(value: number) {
  if (!Number.isFinite(value)) return 'bg-slate-950 text-slate-500';
  if (value >= 0) return 'bg-emerald-950/70 text-emerald-300';
  return 'bg-red-950/70 text-red-300';
}

export default function Matrix() {
  const [rows, setRows] = useState<FactoryDataRow[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [selectedGroup, setSelectedGroup] = useState('EARTH');
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        setRows(await loadFactoryData());
      } catch {
        setError('Unable to load factory CSV data.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const tokenGroups = useMemo(() => {
    const available = [...new Set(rows.map((row) => row.token))];
    return {
      EARTH: available.filter((token) => ['MUD', 'CLAY', 'SAND', 'COPPER', 'STEEL', 'SCREWS'].includes(token)),
      WATER: available.filter((token) => ['SEAWATER', 'ALGAE', 'OXYGEN', 'GAS', 'FUEL', 'OIL'].includes(token)),
      FIRE: available.filter((token) => ['HEAT', 'LAVA', 'GLASS', 'SULFUR', 'FIBERGLASS'].includes(token)),
      ADVANCED: available.filter((token) => !['MUD', 'CLAY', 'SAND', 'COPPER', 'STEEL', 'SCREWS', 'SEAWATER', 'ALGAE', 'OXYGEN', 'GAS', 'FUEL', 'OIL', 'HEAT', 'LAVA', 'GLASS', 'SULFUR', 'FIBERGLASS'].includes(token)),
    };
  }, [rows]);

  const selectedTokens = useMemo(() => {
    const groupTokens = tokenGroups[selectedGroup as keyof typeof tokenGroups] || [];
    return [...groupTokens].sort((a, b) => {
      const indexA = tokenOrder.indexOf(a);
      const indexB = tokenOrder.indexOf(b);
      const normalizedA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
      const normalizedB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
      if (normalizedA !== normalizedB) return normalizedA - normalizedB;
      return a.localeCompare(b);
    });
  }, [selectedGroup, tokenGroups]);

  const maxLevel = useMemo(() => {
    const levels = rows.filter((row) => selectedTokens.includes(row.token)).map((row) => row.level);
    return levels.length ? Math.max(...levels) : 0;
  }, [rows, selectedTokens]);

  const quoteRequests = useMemo(() => {
    const requestMap = new Map<string, { symbol: string; amount: number }>();
    rows
      .filter((row) => selectedTokens.includes(row.token))
      .forEach((row) => {
        [
          { symbol: row.output_token, amount: row.output_amount },
          { symbol: row.input_token_1, amount: row.input_amount_1 },
          { symbol: row.input_token_2, amount: row.input_amount_2 },
        ].forEach(({ symbol, amount }) => {
          if (!symbol || !amount || amount <= 0) return;
          requestMap.set(quoteKey(symbol, amount), { symbol, amount });
        });
      });

    return [...requestMap.entries()].map(([key, request]) => ({ key, ...request }));
  }, [rows, selectedTokens]);

  useEffect(() => {
    if (!quoteRequests.length) return;

    const missingRequests = quoteRequests.filter((request) => !(request.key in quotes));
    if (!missingRequests.length) return;

    let cancelled = false;

    const loadQuotes = async () => {
      setQuoteLoading(true);
      const nextQuotes: Record<string, Quote | null> = {};

      for (const request of missingRequests) {
        try {
          const quote = await enqueueQuoteRequest(() =>
            getCraftworldQuote({
              inputSymbol: request.symbol,
              outputSymbol: 'COIN',
              inputAmount: request.amount,
            }),
          );
          nextQuotes[request.key] = quote;
        } catch {
          nextQuotes[request.key] = null;
        }

        if (!cancelled) setQuotes((current) => ({ ...current, ...nextQuotes }));
      }

      if (!cancelled) setQuoteLoading(false);
    };

    loadQuotes();

    return () => {
      cancelled = true;
    };
  }, [quoteRequests, quotes]);

  const matrix = useMemo(() => {
    const cells: Record<string, MatrixCell> = {};

    rows
      .filter((row) => selectedTokens.includes(row.token))
      .forEach((row) => {
        const outputQuote = quotes[quoteKey(row.output_token, row.output_amount)] || null;
        const input1Quote = quotes[quoteKey(row.input_token_1, row.input_amount_1)] || null;
        const input2Quote = row.input_token_2 ? quotes[quoteKey(row.input_token_2, row.input_amount_2)] || null : null;

        const outputSellValue = outputQuote?.output.amount || 0;
        const inputBuyCost = (input1Quote?.output.amount || 0) + (input2Quote?.output.amount || 0);
        const returnPercent = inputBuyCost > 0 ? ((outputSellValue - inputBuyCost) / inputBuyCost) * 100 : 0;
        const priceImpactPercentage = Math.max(
          outputQuote?.details?.priceImpactPercentage || 0,
          input1Quote?.details?.priceImpactPercentage || 0,
          input2Quote?.details?.priceImpactPercentage || 0,
        );

        cells[`${row.token}-${row.level}`] = {
          row,
          inputBuyCost,
          outputSellValue,
          returnPercent,
          priceImpactPercentage,
          isComplete: Boolean(outputQuote && input1Quote && (!row.input_token_2 || input2Quote)),
        };
      });

    return cells;
  }, [quotes, rows, selectedTokens]);

  if (loading) {
    return (
      <Layout>
        <Card title="Matrix">Loading factory data...</Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card title="Matrix">
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              Dynamic matrix showing return percentage by factory and level. Green is profitable. Red is negative.
            </p>
            <p className="text-sm text-yellow-200">
              Outputs use sell quotes: output token → COIN. Inputs use buy cost labels for every input token. All values are quoted in COIN and include Craft World’s built in 2.5% fee plus impact and slippage returned by the quote call.
            </p>
            {error && <p className="text-sm text-red-300">{error}</p>}
            <div className="flex flex-wrap gap-2">
              {Object.keys(tokenGroups).map((group) => (
                <button
                  key={group}
                  onClick={() => setSelectedGroup(group)}
                  className={`rounded border px-3 py-2 text-sm ${selectedGroup === group ? 'border-blue-400 bg-blue-500/20' : 'border-slate-700 bg-slate-950'}`}
                >
                  {group}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              {quoteLoading ? 'Loading live quote data at one call every 0.25 seconds...' : 'Quotes loaded.'} Showing return as (output sell value minus input buy cost) divided by input buy cost.
            </p>
          </div>
        </Card>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full border-collapse text-center text-sm">
            <thead className="sticky top-0 bg-slate-950">
              <tr>
                <th className="border border-slate-800 px-3 py-2 text-left text-slate-300">Lvl</th>
                {selectedTokens.map((token) => (
                  <th key={token} className="border border-slate-800 px-3 py-2 text-slate-300">
                    {token}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxLevel }, (_, index) => index + 1).map((level) => (
                <tr key={level}>
                  <td className="border border-slate-800 bg-slate-950 px-3 py-2 text-left text-slate-300">{level}</td>
                  {selectedTokens.map((token) => {
                    const cell = matrix[`${token}-${level}`];
                    if (!cell) {
                      return (
                        <td key={`${token}-${level}`} className="border border-slate-800 bg-slate-950 px-3 py-2 text-slate-700">
                          ·
                        </td>
                      );
                    }

                    if (!cell.isComplete) {
                      return (
                        <td key={`${token}-${level}`} className="border border-slate-800 bg-slate-950 px-3 py-2 text-slate-500" title="Waiting for quote data">
                          ...
                        </td>
                      );
                    }

                    return (
                      <td
                        key={`${token}-${level}`}
                        className={`border border-slate-800 px-3 py-2 font-mono ${getCellClass(cell.returnPercent)}`}
                        title={`Output sell value ${formatNumber(cell.outputSellValue, 6)} COIN • Input buy cost ${formatNumber(cell.inputBuyCost, 6)} COIN • Impact ${formatNumber(cell.priceImpactPercentage, 2)}%`}
                      >
                        {cell.returnPercent >= 0 ? '+' : ''}{formatNumber(cell.returnPercent, 2)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
