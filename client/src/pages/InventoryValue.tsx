import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { getCraftworldHome, getCraftworldQuote } from '../services/api';

type ResourceAmount = {
  symbol?: string;
  amount?: number;
};

type Quote = {
  type: string;
  input: { symbol: string; amount: number };
  output: { symbol: string; amount: number };
  details?: { priceImpactPercentage?: number };
};

type QuoteMap = Record<string, Quote | null>;

type InventoryValueRow = {
  symbol: string;
  amount: number;
  quote: Quote | null;
  value: number;
  impact: number;
};

const QUOTE_BATCH_SIZE = 12;

function quoteKey(symbol: string, amount: number) {
  return `${symbol.toUpperCase()}-${amount}`;
}

function formatNumber(value: number, digits = 6) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0';
}

function normalizeInventory(resources: ResourceAmount[]) {
  const bySymbol = new Map<string, number>();

  resources.forEach((resource) => {
    const symbol = String(resource.symbol || '').trim().toUpperCase();
    const amount = Number(resource.amount || 0);
    if (!symbol || amount <= 0) return;
    bySymbol.set(symbol, (bySymbol.get(symbol) || 0) + amount);
  });

  return Array.from(bySymbol.entries())
    .map(([symbol, amount]) => ({ symbol, amount }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export default function InventoryValue() {
  const [inventory, setInventory] = useState<Array<{ symbol: string; amount: number }>>([]);
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quotedCount, setQuotedCount] = useState(0);
  const [error, setError] = useState('');
  const [quoteError, setQuoteError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const home = await getCraftworldHome();
        setInventory(normalizeInventory(home.inventory || []));
      } catch {
        setError('Unable to load inventory data. Refresh and try again.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const quoteRequests = useMemo(() => {
    return inventory.map((item) => ({
      symbol: item.symbol,
      amount: item.amount,
      key: quoteKey(item.symbol, item.amount),
    }));
  }, [inventory]);

  useEffect(() => {
    if (!quoteRequests.length) return;
    let cancelled = false;

    const loadQuotes = async () => {
      setQuoteLoading(true);
      setQuoteError('');
      setQuotedCount(0);

      try {
        const missingRequests = quoteRequests.filter((request) => quotes[request.key] === undefined);

        for (let index = 0; index < missingRequests.length; index += QUOTE_BATCH_SIZE) {
          const batch = missingRequests.slice(index, index + QUOTE_BATCH_SIZE);
          const entries = await Promise.all(
            batch.map(async (request) => {
              try {
                const quote = await getCraftworldQuote({
                  inputSymbol: request.symbol,
                  outputSymbol: 'COIN',
                  inputAmount: request.amount,
                });
                return [request.key, quote] as const;
              } catch {
                return [request.key, null] as const;
              }
            }),
          );

          if (cancelled) return;
          setQuotes((current) => ({ ...current, ...Object.fromEntries(entries) }));
          setQuotedCount((current) => current + entries.length);
        }
      } catch {
        if (!cancelled) setQuoteError('Unable to load one or more inventory quotes.');
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    };

    loadQuotes();
    return () => {
      cancelled = true;
    };
  }, [quoteRequests]);

  const valueRows = useMemo<InventoryValueRow[]>(() => {
    return inventory
      .map((item) => {
        const quote = quotes[quoteKey(item.symbol, item.amount)] || null;
        return {
          symbol: item.symbol,
          amount: item.amount,
          quote,
          value: quote?.output.amount || 0,
          impact: quote?.details?.priceImpactPercentage || 0,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [inventory, quotes]);

  const quotedRows = valueRows.filter((row) => row.quote);
  const totalValue = quotedRows.reduce((sum, row) => sum + row.value, 0);
  const highestValueRow = quotedRows[0] || null;

  if (loading) {
    return (
      <Layout>
        <Card title="Inventory Value">Loading your inventory...</Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card title="Inventory Value">
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              This estimates the COIN value of every resource in your inventory using live Craft World quotes.
            </p>
            {quoteLoading && (
              <p className="text-sm text-slate-400">
                Loading inventory prices in parallel batches... {quotedCount}/{quoteRequests.length} quotes checked.
              </p>
            )}
            {error && <p className="text-sm text-red-300">{error}</p>}
            {quoteError && <p className="text-sm text-red-300">{quoteError}</p>}
            {!inventory.length && <p className="text-sm text-slate-400">No inventory resources were found for this account yet.</p>}
          </div>
        </Card>

        <div className="grid gap-3 md:grid-cols-3">
          <Card title="Quoted Inventory Value">{formatNumber(totalValue)} COIN</Card>
          <Card title="Resources Found">{inventory.length.toLocaleString()}</Card>
          <Card title="Highest Value Resource">
            {highestValueRow ? `${highestValueRow.symbol}: ${formatNumber(highestValueRow.value)} COIN` : 'Waiting for prices'}
          </Card>
        </div>

        {valueRows.length > 0 && (
          <Card title="Resources Ranked by COIN Value">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="p-2">Rank</th>
                    <th className="p-2">Resource</th>
                    <th className="p-2">Amount Owned</th>
                    <th className="p-2">Estimated COIN Value</th>
                    <th className="p-2">Price Impact</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {valueRows.map((row, index) => (
                    <tr key={row.symbol} className="border-t border-slate-800">
                      <td className="p-2">{index + 1}</td>
                      <td className="p-2 font-semibold">{row.symbol}</td>
                      <td className="p-2">{formatNumber(row.amount)}</td>
                      <td className="p-2 text-emerald-300">{row.quote ? `${formatNumber(row.value)} COIN` : 'Waiting'}</td>
                      <td className="p-2">{row.quote ? `${formatNumber(row.impact, 2)}%` : 'Waiting'}</td>
                      <td className="p-2">{row.quote ? 'Ready' : 'Waiting for quote'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
