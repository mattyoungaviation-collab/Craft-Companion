import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { getCraftworldBuyQuote, getCraftworldHome, getCraftworldQuote } from '../services/api';
import { loadFactoryData, type FactoryDataRow } from '../services/factoryData';

type OwnedFactory = {
  id?: string;
  areaSymbol?: string;
  level?: number;
  landPlotName?: string;
  currentRunLevel?: number;
};

type OwnedFactoryOption = {
  key: string;
  symbol: string;
  displayLevel: number;
  nextDisplayLevel: number;
  plotName: string;
  currentRow: FactoryDataRow | null;
  nextRow: FactoryDataRow | null;
};

type Quote = {
  input: { symbol: string; amount: number };
  output: { symbol: string; amount: number };
  details?: { priceImpactPercentage?: number };
};

type QuoteMap = Record<string, Quote | null>;

type UpgradeAdvisorRow = {
  option: OwnedFactoryOption;
  currentProfitPerHour: number;
  nextProfitPerHour: number;
  profitGainPerHour: number;
  upgradeToken: string;
  upgradeAmount: number;
  upgradeCost: number;
  breakEvenHours: number;
  missingQuote: boolean;
  maxImpact: number;
};

const QUOTE_BATCH_SIZE = 12;

function quoteKey(symbol: string, amount: number) {
  return `SELL-${symbol.toUpperCase()}-${amount}`;
}

function buyQuoteKey(symbol: string, amount: number) {
  return `BUY-COIN-${symbol.toUpperCase()}-${amount}`;
}

function formatNumber(value: number, digits = 6) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0';
}

function formatHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return 'Not profitable';
  if (hours < 1) return `${formatNumber(hours * 60, 1)} min`;
  if (hours < 24) return `${formatNumber(hours, 2)} hr`;
  return `${formatNumber(hours / 24, 2)} days`;
}

function formatFactoryLabel(option: OwnedFactoryOption) {
  return `${option.plotName} • ${option.symbol} • Lv ${option.displayLevel} → Lv ${option.nextDisplayLevel}`;
}

function getRecipeQuoteRequests(row: FactoryDataRow | null) {
  if (!row) return [] as Array<{ type: 'sell'; symbol: string; amount: number; key: string }>;

  const requests = [
    { type: 'sell' as const, symbol: row.output_token, amount: row.output_amount, key: quoteKey(row.output_token, row.output_amount) },
    { type: 'sell' as const, symbol: row.input_token_1, amount: row.input_amount_1, key: quoteKey(row.input_token_1, row.input_amount_1) },
  ];

  if (row.input_token_2 && row.input_amount_2 > 0) {
    requests.push({ type: 'sell' as const, symbol: row.input_token_2, amount: row.input_amount_2, key: quoteKey(row.input_token_2, row.input_amount_2) });
  }

  return requests;
}

function getUpgradeBuyQuoteRequest(row: FactoryDataRow | null) {
  if (!row?.upgrade_token || row.upgrade_amount <= 0) return null;
  return {
    type: 'buy' as const,
    symbol: row.upgrade_token,
    amount: row.upgrade_amount,
    key: buyQuoteKey(row.upgrade_token, row.upgrade_amount),
  };
}

function getUpgradeCostRow(option: OwnedFactoryOption) {
  return option.nextRow;
}

function getRecipeProfitPerHour(row: FactoryDataRow | null, quotes: QuoteMap) {
  if (!row) return { profitPerHour: 0, missingQuote: true, maxImpact: 0 };

  const outputQuote = quotes[quoteKey(row.output_token, row.output_amount)] || null;
  const input1Quote = quotes[quoteKey(row.input_token_1, row.input_amount_1)] || null;
  const input2Quote = row.input_token_2 ? quotes[quoteKey(row.input_token_2, row.input_amount_2)] || null : null;

  const missingQuote = !outputQuote || !input1Quote || Boolean(row.input_token_2 && !input2Quote);
  const outputValue = outputQuote?.output.amount || 0;
  const inputCost = (input1Quote?.output.amount || 0) + (input2Quote?.output.amount || 0);
  const profitPerRun = outputValue - inputCost;
  const runsPerHour = row.duration_min ? 60 / row.duration_min : 0;
  const impacts = [outputQuote, input1Quote, input2Quote]
    .map((quote) => quote?.details?.priceImpactPercentage || 0)
    .filter((impact) => Number.isFinite(impact));

  return {
    profitPerHour: missingQuote ? 0 : profitPerRun * runsPerHour,
    missingQuote,
    maxImpact: impacts.length ? Math.max(...impacts) : 0,
  };
}

export default function UpgradeAdvisor() {
  const [rows, setRows] = useState<FactoryDataRow[]>([]);
  const [ownedFactories, setOwnedFactories] = useState<OwnedFactory[]>([]);
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
        const [factoryRows, homeData] = await Promise.all([loadFactoryData(), getCraftworldHome()]);
        setRows(factoryRows);
        setOwnedFactories(homeData.factories || []);
      } catch {
        setError('Unable to load upgrade advisor data. Refresh and try again.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const factoryOptions = useMemo<OwnedFactoryOption[]>(() => {
    return ownedFactories
      .map((factory, index) => {
        const symbol = String(factory.areaSymbol || '').trim().toUpperCase();
        const displayLevel = typeof factory.level === 'number' ? factory.level + 1 : 0;
        const nextDisplayLevel = displayLevel + 1;
        const plotName = factory.landPlotName || 'Unknown plot';
        const currentRow = rows.find((row) => row.token === symbol && row.level === displayLevel) || null;
        const nextRow = rows.find((row) => row.token === symbol && row.level === nextDisplayLevel) || null;

        return {
          key: factory.id || `${plotName}-${symbol}-${displayLevel}-${index}`,
          symbol,
          displayLevel,
          nextDisplayLevel,
          plotName,
          currentRow,
          nextRow,
        };
      })
      .filter((option) => option.symbol && option.currentRow && option.nextRow)
      .sort((a, b) => {
        const symbolSort = a.symbol.localeCompare(b.symbol);
        if (symbolSort !== 0) return symbolSort;
        return b.displayLevel - a.displayLevel;
      });
  }, [ownedFactories, rows]);

  const quoteRequests = useMemo(() => {
    const byKey = new Map<string, { type: 'sell' | 'buy'; symbol: string; amount: number; key: string }>();

    factoryOptions.forEach((option) => {
      [...getRecipeQuoteRequests(option.currentRow), ...getRecipeQuoteRequests(option.nextRow)].forEach((request) => {
        if (!byKey.has(request.key)) byKey.set(request.key, request);
      });

      const upgradeRequest = getUpgradeBuyQuoteRequest(getUpgradeCostRow(option));
      if (upgradeRequest && !byKey.has(upgradeRequest.key)) byKey.set(upgradeRequest.key, upgradeRequest);
    });

    return Array.from(byKey.values());
  }, [factoryOptions]);

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
                const quote = request.type === 'buy'
                  ? await getCraftworldBuyQuote({
                      inputSymbol: 'COIN',
                      outputSymbol: request.symbol,
                      outputAmount: request.amount,
                    })
                  : await getCraftworldQuote({
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
        if (!cancelled) setQuoteError('Unable to load one or more upgrade quotes.');
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    };

    loadQuotes();
    return () => {
      cancelled = true;
    };
  }, [quoteRequests]);

  const advisorRows = useMemo<UpgradeAdvisorRow[]>(() => {
    return factoryOptions
      .map((option) => {
        const current = getRecipeProfitPerHour(option.currentRow, quotes);
        const next = getRecipeProfitPerHour(option.nextRow, quotes);
        const upgradeCostRow = getUpgradeCostRow(option);
        const upgradeToken = upgradeCostRow?.upgrade_token || '';
        const upgradeAmount = upgradeCostRow?.upgrade_amount || 0;
        const upgradeQuote = upgradeToken ? quotes[buyQuoteKey(upgradeToken, upgradeAmount)] || null : null;
        const upgradeCost = upgradeQuote?.input.amount || 0;
        const profitGainPerHour = next.profitPerHour - current.profitPerHour;
        const breakEvenHours = profitGainPerHour > 0 ? upgradeCost / profitGainPerHour : Number.POSITIVE_INFINITY;
        const upgradeImpact = upgradeQuote?.details?.priceImpactPercentage || 0;

        return {
          option,
          currentProfitPerHour: current.profitPerHour,
          nextProfitPerHour: next.profitPerHour,
          profitGainPerHour,
          upgradeToken,
          upgradeAmount,
          upgradeCost,
          breakEvenHours,
          missingQuote: current.missingQuote || next.missingQuote || !upgradeQuote,
          maxImpact: Math.max(current.maxImpact, next.maxImpact, upgradeImpact),
        };
      })
      .sort((a, b) => {
        if (a.missingQuote !== b.missingQuote) return a.missingQuote ? 1 : -1;
        return a.breakEvenHours - b.breakEvenHours;
      });
  }, [factoryOptions, quotes]);

  const readyRows = advisorRows.filter((row) => !row.missingQuote);
  const bestUpgrade = readyRows.find((row) => row.profitGainPerHour > 0) || null;
  const missingNextLevelCount = ownedFactories.length - factoryOptions.length;

  if (loading) {
    return (
      <Layout>
        <Card title="Upgrade Advisor">Loading upgrade data...</Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card title="Upgrade Advisor">
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              This compares your current factory level against the next level. Upgrade requirements are read from the next level row, then quoted as the COIN buy cost for that exact resource amount.
            </p>
            {quoteLoading && (
              <p className="text-sm text-slate-400">
                Loading upgrade prices in parallel batches... {quotedCount}/{quoteRequests.length} quotes checked.
              </p>
            )}
            {error && <p className="text-sm text-red-300">{error}</p>}
            {quoteError && <p className="text-sm text-red-300">{quoteError}</p>}
            {missingNextLevelCount > 0 && (
              <p className="text-sm text-yellow-200">
                {missingNextLevelCount} owned factories are missing a current or next level CSV match and are excluded.
              </p>
            )}
            {bestUpgrade ? (
              <div className="rounded-lg border border-emerald-400/70 bg-emerald-500/10 p-3 text-sm">
                <p className="font-semibold text-emerald-200">Best upgrade candidate</p>
                <p>{formatFactoryLabel(bestUpgrade.option)}</p>
                <p>Requires: {formatNumber(bestUpgrade.upgradeAmount)} {bestUpgrade.upgradeToken}</p>
                <p>Buy cost: {formatNumber(bestUpgrade.upgradeCost)} COIN</p>
                <p>Added profit per hour: {formatNumber(bestUpgrade.profitGainPerHour)} COIN</p>
                <p>Break even: {formatHours(bestUpgrade.breakEvenHours)}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No profitable upgrade recommendation is ready yet.</p>
            )}
          </div>
        </Card>

        <Card title="All Upgrade Candidates">
          {advisorRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="p-2">Rank</th>
                    <th className="p-2">Factory</th>
                    <th className="p-2">Upgrade Requires</th>
                    <th className="p-2">Buy Cost</th>
                    <th className="p-2">Current Profit/Hr</th>
                    <th className="p-2">Next Profit/Hr</th>
                    <th className="p-2">Gain/Hr</th>
                    <th className="p-2">Break Even</th>
                    <th className="p-2">Impact</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {advisorRows.map((row, index) => (
                    <tr key={row.option.key} className="border-t border-slate-800">
                      <td className="p-2">{index + 1}</td>
                      <td className="p-2">{formatFactoryLabel(row.option)}</td>
                      <td className="p-2">{row.upgradeToken ? `${formatNumber(row.upgradeAmount)} ${row.upgradeToken}` : 'N/A'}</td>
                      <td className="p-2">{row.missingQuote ? 'Waiting' : `${formatNumber(row.upgradeCost)} COIN`}</td>
                      <td className="p-2">{row.missingQuote ? 'Waiting' : `${formatNumber(row.currentProfitPerHour)} COIN`}</td>
                      <td className="p-2">{row.missingQuote ? 'Waiting' : `${formatNumber(row.nextProfitPerHour)} COIN`}</td>
                      <td className={row.profitGainPerHour >= 0 ? 'p-2 text-emerald-300' : 'p-2 text-red-300'}>
                        {row.missingQuote ? 'Waiting' : `${formatNumber(row.profitGainPerHour)} COIN`}
                      </td>
                      <td className="p-2">{row.missingQuote ? 'Waiting' : formatHours(row.breakEvenHours)}</td>
                      <td className="p-2">{row.missingQuote ? 'Waiting' : `${formatNumber(row.maxImpact, 2)}%`}</td>
                      <td className="p-2">{row.missingQuote ? 'Waiting for quotes' : row.profitGainPerHour > 0 ? 'Candidate' : 'Not worth it yet'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No upgrade candidates were found yet.</p>
          )}
        </Card>
      </div>
    </Layout>
  );
}
