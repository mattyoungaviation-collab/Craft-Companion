import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { getCraftworldHome, getCraftworldQuote } from '../services/api';
import { loadFactoryData, type FactoryDataRow } from '../services/factoryData';
import { enqueueQuoteRequest } from '../utils/rateLimit';

type OwnedFactory = {
  id?: string;
  areaSymbol?: string;
  level?: number;
  landPlotName?: string;
  currentRunLevel?: number;
  activeBoosts?: { boostValue?: number }[];
};

type OwnedFactoryOption = {
  key: string;
  factory: OwnedFactory;
  symbol: string;
  displayLevel: number;
  craftDisplayLevel: number | null;
  plotName: string;
  matchingCsvRow: FactoryDataRow | null;
};

type Quote = {
  type: string;
  input: { symbol: string; amount: number };
  output: { symbol: string; amount: number };
  details?: { priceImpactPercentage?: number };
};

type QuoteMap = Record<string, Quote | null>;

function formatNumber(value: number, digits = 6) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0';
}

function formatFactoryLabel(option: OwnedFactoryOption) {
  const craftLevel = option.craftDisplayLevel ? ` • Craft Lv ${option.craftDisplayLevel}` : '';
  return `${option.plotName} • ${option.symbol} • Lv ${option.displayLevel}${craftLevel}`;
}

function quoteKey(symbol: string, amount: number) {
  return `${symbol.toUpperCase()}-${amount}`;
}

function QuoteLine({ label, quote }: { label: string; quote: Quote | null | undefined }) {
  if (!quote) return <p>{label}: Quote unavailable</p>;

  return (
    <p>
      {label}: {formatNumber(quote.input.amount)} {quote.input.symbol} valued at {formatNumber(quote.output.amount)} {quote.output.symbol} • Impact{' '}
      {formatNumber(quote.details?.priceImpactPercentage || 0, 2)}%
    </p>
  );
}

export default function Profitability() {
  const [rows, setRows] = useState<FactoryDataRow[]>([]);
  const [ownedFactories, setOwnedFactories] = useState<OwnedFactory[]>([]);
  const [selectedFactoryKey, setSelectedFactoryKey] = useState('');
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState('');
  const [quoteError, setQuoteError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const [factoryRows, homeData] = await Promise.all([loadFactoryData(), getCraftworldHome()]);
        setRows(factoryRows);
        setOwnedFactories(homeData.factories || []);
      } catch {
        setError('Unable to load profitability data. Refresh and try again.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const ownedFactoryOptions = useMemo<OwnedFactoryOption[]>(() => {
    return ownedFactories
      .map((factory, index) => {
        const symbol = String(factory.areaSymbol || '').trim().toUpperCase();
        const displayLevel = typeof factory.level === 'number' ? factory.level + 1 : 0;
        const craftDisplayLevel = typeof factory.currentRunLevel === 'number' ? factory.currentRunLevel + 1 : null;
        const plotName = factory.landPlotName || 'Unknown plot';
        const matchingCsvRow = rows.find((row) => row.token === symbol && row.level === displayLevel) || null;

        return {
          key: factory.id || `${plotName}-${symbol}-${displayLevel}-${index}`,
          factory,
          symbol,
          displayLevel,
          craftDisplayLevel,
          plotName,
          matchingCsvRow,
        };
      })
      .filter((option) => option.symbol)
      .sort((a, b) => {
        const plotSort = a.plotName.localeCompare(b.plotName);
        if (plotSort !== 0) return plotSort;
        const symbolSort = a.symbol.localeCompare(b.symbol);
        if (symbolSort !== 0) return symbolSort;
        return b.displayLevel - a.displayLevel;
      });
  }, [ownedFactories, rows]);

  useEffect(() => {
    if (!ownedFactoryOptions.length) {
      setSelectedFactoryKey('');
      return;
    }

    const selectedStillExists = ownedFactoryOptions.some((option) => option.key === selectedFactoryKey);
    if (!selectedStillExists) setSelectedFactoryKey(ownedFactoryOptions[0].key);
  }, [ownedFactoryOptions, selectedFactoryKey]);

  const selectedFactory = useMemo(
    () => ownedFactoryOptions.find((option) => option.key === selectedFactoryKey) || null,
    [ownedFactoryOptions, selectedFactoryKey],
  );

  const selectedRow = selectedFactory?.matchingCsvRow || null;

  const quoteRequests = useMemo(() => {
    if (!selectedRow) return [] as Array<{ symbol: string; amount: number; key: string; label: string }>;

    const requests = [
      {
        symbol: selectedRow.output_token,
        amount: selectedRow.output_amount,
        key: quoteKey(selectedRow.output_token, selectedRow.output_amount),
        label: 'Output Sell Value',
      },
      {
        symbol: selectedRow.input_token_1,
        amount: selectedRow.input_amount_1,
        key: quoteKey(selectedRow.input_token_1, selectedRow.input_amount_1),
        label: 'Input 1 Cost',
      },
    ];

    if (selectedRow.input_token_2 && selectedRow.input_amount_2 > 0) {
      requests.push({
        symbol: selectedRow.input_token_2,
        amount: selectedRow.input_amount_2,
        key: quoteKey(selectedRow.input_token_2, selectedRow.input_amount_2),
        label: 'Input 2 Cost',
      });
    }

    if (selectedRow.upgrade_token && selectedRow.upgrade_amount > 0) {
      requests.push({
        symbol: selectedRow.upgrade_token,
        amount: selectedRow.upgrade_amount,
        key: quoteKey(selectedRow.upgrade_token, selectedRow.upgrade_amount),
        label: 'Upgrade Cost',
      });
    }

    return requests;
  }, [selectedRow]);

  useEffect(() => {
    if (!quoteRequests.length) return;
    let cancelled = false;

    const loadQuotes = async () => {
      setQuoteLoading(true);
      setQuoteError('');

      try {
        const nextQuotes: QuoteMap = {};
        for (const request of quoteRequests) {
          try {
            const quote = await enqueueQuoteRequest(() => getCraftworldQuote({
              inputSymbol: request.symbol,
              outputSymbol: 'COIN',
              inputAmount: request.amount,
            }));
            nextQuotes[request.key] = quote;
          } catch {
            nextQuotes[request.key] = null;
          }

          if (!cancelled) setQuotes((current) => ({ ...current, ...nextQuotes }));
        }
      } catch {
        if (!cancelled) setQuoteError('Unable to load one or more Craft World quotes.');
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    };

    loadQuotes();
    return () => {
      cancelled = true;
    };
  }, [quoteRequests]);

  const getQuote = (symbol: string, amount: number) => quotes[quoteKey(symbol, amount)] || null;

  const outputQuote = selectedRow ? getQuote(selectedRow.output_token, selectedRow.output_amount) : null;
  const input1Quote = selectedRow ? getQuote(selectedRow.input_token_1, selectedRow.input_amount_1) : null;
  const input2Quote = selectedRow?.input_token_2 ? getQuote(selectedRow.input_token_2, selectedRow.input_amount_2) : null;
  const upgradeQuote = selectedRow?.upgrade_token ? getQuote(selectedRow.upgrade_token, selectedRow.upgrade_amount) : null;

  const inputCost = (input1Quote?.output.amount || 0) + (input2Quote?.output.amount || 0);
  const outputValue = outputQuote?.output.amount || 0;
  const profitPerRun = outputValue - inputCost;
  const runsPerHour = selectedRow?.duration_min ? 60 / selectedRow.duration_min : 0;
  const profitPerHour = profitPerRun * runsPerHour;
  const upgradeCost = upgradeQuote?.output.amount || 0;

  if (loading) {
    return (
      <Layout>
        <Card title="Profitability Calculator">Loading your factories...</Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card title="Profitability Calculator">
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              Select one of your live Craft World factories. The calculator matches your owned factory level to the uploaded factory CSV.
            </p>
            <p className="text-sm text-yellow-200">
              Output value uses the sell quote: output token → COIN. Input costs use the same token → COIN value so returns compare against what those inputs are worth in COIN.
            </p>
            <p className="text-sm text-yellow-200">
              All prices are quoted in COIN using Craft World exact input quotes. Values include the built in 2.5% fee plus impact and slippage returned by Craft World. Quote calls are limited to one request every 0.25 seconds.
            </p>

            {error && <p className="text-sm text-red-300">{error}</p>}
            {quoteError && <p className="text-sm text-red-300">{quoteError}</p>}

            {!ownedFactoryOptions.length ? (
              <p className="text-sm text-slate-400">No live factories were found for this account yet.</p>
            ) : (
              <label className="space-y-1 text-sm">
                <span>Your Factory</span>
                <select
                  value={selectedFactoryKey}
                  onChange={(event) => setSelectedFactoryKey(event.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                >
                  {ownedFactoryOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {formatFactoryLabel(option)}{option.matchingCsvRow ? '' : ' • No CSV match'}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </Card>

        {selectedFactory && !selectedRow && (
          <Card title="CSV Match Missing">
            <p className="text-sm text-yellow-200">
              No CSV row was found for {selectedFactory.symbol} level {selectedFactory.displayLevel}. The uploaded CSV may not include this factory level yet.
            </p>
          </Card>
        )}

        {selectedFactory && selectedRow && (
          <>
            <Card title="Selected Owned Factory">
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <p>Plot: {selectedFactory.plotName}</p>
                <p>Factory: {selectedFactory.symbol}</p>
                <p>Owned Display Level: {selectedFactory.displayLevel}</p>
                <p>Craft Level: {selectedFactory.craftDisplayLevel || 'N/A'}</p>
                <p>CSV Level: {selectedRow.level}</p>
                <p>Duration: {formatNumber(selectedRow.duration_min, 2)} min</p>
                <p>Output: {formatNumber(selectedRow.output_amount)} {selectedRow.output_token}</p>
                <p>Input 1: {formatNumber(selectedRow.input_amount_1)} {selectedRow.input_token_1}</p>
                <p>Input 2: {selectedRow.input_token_2 ? `${formatNumber(selectedRow.input_amount_2)} ${selectedRow.input_token_2}` : 'N/A'}</p>
                <p>Upgrade: {selectedRow.upgrade_token ? `${formatNumber(selectedRow.upgrade_amount)} ${selectedRow.upgrade_token}` : 'N/A'}</p>
              </div>
            </Card>

            <Card title="Live COIN Quotes">
              <div className="space-y-2 text-sm">
                {quoteLoading && <p className="text-slate-400">Loading Craft World quotes...</p>}
                <QuoteLine label="Output Sell Value" quote={outputQuote} />
                <QuoteLine label="Input 1 Value" quote={input1Quote} />
                {selectedRow.input_token_2 && <QuoteLine label="Input 2 Value" quote={input2Quote} />}
                {selectedRow.upgrade_token && <QuoteLine label="Upgrade Value" quote={upgradeQuote} />}
              </div>
            </Card>

            <Card title="Results">
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <p>Input Value: {formatNumber(inputCost)} COIN</p>
                <p>Output Sell Value: {formatNumber(outputValue)} COIN</p>
                <p>Profit Per Run: {formatNumber(profitPerRun)} COIN</p>
                <p>Profit Per Hour: {formatNumber(profitPerHour)} COIN</p>
                <p>Runs Per Hour: {formatNumber(runsPerHour, 4)}</p>
                <p>Upgrade Value: {formatNumber(upgradeCost)} COIN</p>
              </div>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
