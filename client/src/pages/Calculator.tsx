import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { getCraftworldBuyQuote, getCraftworldQuote } from '../services/api';
import { loadFactoryData, type FactoryDataRow } from '../services/factoryData';

type Quote = {
  type: string;
  input: { symbol: string; amount: number };
  output: { symbol: string; amount: number };
  details?: { priceImpactPercentage?: number };
};

type QuoteMap = Record<string, Quote | null>;

type QuoteRequest = {
  type: 'sell' | 'buy';
  symbol: string;
  amount: number;
  key: string;
};

type RecipePnl = {
  row: FactoryDataRow | null;
  outputValue: number;
  inputCost: number;
  profitPerRun: number;
  runsPerHour: number;
  profitPerHour: number;
  missingQuote: boolean;
  maxImpact: number;
};

type UpgradeStep = {
  fromLevel: number;
  toLevel: number;
  token: string;
  amountPerFactory: number;
  totalAmount: number;
  quote: Quote | null;
  cost: number;
  impact: number;
  missingQuote: boolean;
};

const BATCH_SIZE = 12;

function fmt(value: number, digits = 6) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0';
}

function normalizeAmount(amount: number) {
  return Number(amount.toFixed(8));
}

function sellKey(symbol: string, amount: number) {
  return `SELL:${symbol.toUpperCase()}:${normalizeAmount(amount)}`;
}

function buyKey(symbol: string, amount: number) {
  return `BUY:COIN:${symbol.toUpperCase()}:${normalizeAmount(amount)}`;
}

function numberInput(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLevels(rows: FactoryDataRow[], token: string) {
  return rows
    .filter((row) => row.token === token)
    .map((row) => row.level)
    .filter((level, index, levels) => levels.indexOf(level) === index)
    .sort((a, b) => a - b);
}

function getRow(rows: FactoryDataRow[], token: string, level: number) {
  return rows.find((row) => row.token === token && row.level === level) || null;
}

function getRecipeRequests(row: FactoryDataRow | null) {
  if (!row) return [] as QuoteRequest[];

  const requests: QuoteRequest[] = [
    { type: 'sell', symbol: row.output_token, amount: row.output_amount, key: sellKey(row.output_token, row.output_amount) },
  ];

  if (row.input_token_1 && row.input_amount_1 > 0) {
    requests.push({ type: 'buy', symbol: row.input_token_1, amount: row.input_amount_1, key: buyKey(row.input_token_1, row.input_amount_1) });
  }

  if (row.input_token_2 && row.input_amount_2 > 0) {
    requests.push({ type: 'buy', symbol: row.input_token_2, amount: row.input_amount_2, key: buyKey(row.input_token_2, row.input_amount_2) });
  }

  return requests;
}

function getUpgradeRows(rows: FactoryDataRow[], token: string, currentLevel: number, targetLevel: number, factoryCount: number) {
  const steps: Array<{ fromLevel: number; toLevel: number; row: FactoryDataRow; totalAmount: number }> = [];

  for (let level = currentLevel + 1; level <= targetLevel; level += 1) {
    const row = getRow(rows, token, level);
    if (!row || !row.upgrade_token || row.upgrade_amount <= 0) continue;
    steps.push({
      fromLevel: level - 1,
      toLevel: level,
      row,
      totalAmount: normalizeAmount(row.upgrade_amount * factoryCount),
    });
  }

  return steps;
}

function calculateRecipePnl(row: FactoryDataRow | null, quotes: QuoteMap): RecipePnl {
  if (!row) {
    return {
      row: null,
      outputValue: 0,
      inputCost: 0,
      profitPerRun: 0,
      runsPerHour: 0,
      profitPerHour: 0,
      missingQuote: true,
      maxImpact: 0,
    };
  }

  const outputQuote = quotes[sellKey(row.output_token, row.output_amount)] || null;
  const input1Quote = row.input_token_1 && row.input_amount_1 > 0 ? quotes[buyKey(row.input_token_1, row.input_amount_1)] || null : null;
  const input2Quote = row.input_token_2 && row.input_amount_2 > 0 ? quotes[buyKey(row.input_token_2, row.input_amount_2)] || null : null;
  const missingQuote = !outputQuote || Boolean(row.input_token_1 && row.input_amount_1 > 0 && !input1Quote) || Boolean(row.input_token_2 && row.input_amount_2 > 0 && !input2Quote);
  const outputValue = outputQuote?.output.amount || 0;
  const inputCost = (input1Quote?.input.amount || 0) + (input2Quote?.input.amount || 0);
  const profitPerRun = outputValue - inputCost;
  const runsPerHour = row.duration_min > 0 ? 60 / row.duration_min : 0;
  const profitPerHour = profitPerRun * runsPerHour;
  const maxImpact = Math.max(
    outputQuote?.details?.priceImpactPercentage || 0,
    input1Quote?.details?.priceImpactPercentage || 0,
    input2Quote?.details?.priceImpactPercentage || 0,
  );

  return { row, outputValue, inputCost, profitPerRun, runsPerHour, profitPerHour, missingQuote, maxImpact };
}

function QuoteLine({ label, quote }: { label: string; quote: Quote | null | undefined }) {
  if (!quote) return <p>{label}: Waiting for quote</p>;
  return (
    <p>
      {label}: {fmt(quote.input.amount)} {quote.input.symbol} for {fmt(quote.output.amount)} {quote.output.symbol} • Impact {fmt(quote.details?.priceImpactPercentage || 0, 2)}%
    </p>
  );
}

export default function Calculator() {
  const [rows, setRows] = useState<FactoryDataRow[]>([]);
  const [factoryType, setFactoryType] = useState('');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [targetLevel, setTargetLevel] = useState(2);
  const [factoryCount, setFactoryCount] = useState(1);
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quotedCount, setQuotedCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const factoryRows = await loadFactoryData();
        setRows(factoryRows);
        const tokens = Array.from(new Set(factoryRows.map((row) => row.token).filter(Boolean))).sort();
        const firstToken = tokens[0] || '';
        setFactoryType(firstToken);
        const levels = getLevels(factoryRows, firstToken);
        setCurrentLevel(levels[0] || 1);
        setTargetLevel(levels[1] || levels[0] || 1);
      } catch {
        setError('Unable to load calculator data. Refresh and try again.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const factoryTypes = useMemo(() => Array.from(new Set(rows.map((row) => row.token).filter(Boolean))).sort(), [rows]);
  const levels = useMemo(() => getLevels(rows, factoryType), [rows, factoryType]);
  const currentRow = useMemo(() => getRow(rows, factoryType, currentLevel), [rows, factoryType, currentLevel]);
  const targetRow = useMemo(() => getRow(rows, factoryType, targetLevel), [rows, factoryType, targetLevel]);
  const upgradeRows = useMemo(() => getUpgradeRows(rows, factoryType, currentLevel, targetLevel, factoryCount), [rows, factoryType, currentLevel, targetLevel, factoryCount]);

  useEffect(() => {
    if (!factoryType || !levels.length) return;
    if (!levels.includes(currentLevel)) setCurrentLevel(levels[0]);
    if (!levels.includes(targetLevel) || targetLevel <= currentLevel) {
      const nextLevel = levels.find((level) => level > currentLevel) || currentLevel;
      setTargetLevel(nextLevel);
    }
  }, [factoryType, levels, currentLevel, targetLevel]);

  const quoteRequests = useMemo(() => {
    const map = new Map<string, QuoteRequest>();

    [...getRecipeRequests(currentRow), ...getRecipeRequests(targetRow)].forEach((request) => map.set(request.key, request));
    upgradeRows.forEach((step) => {
      map.set(buyKey(step.row.upgrade_token, step.totalAmount), {
        type: 'buy',
        symbol: step.row.upgrade_token,
        amount: step.totalAmount,
        key: buyKey(step.row.upgrade_token, step.totalAmount),
      });
    });

    return Array.from(map.values());
  }, [currentRow, targetRow, upgradeRows]);

  useEffect(() => {
    if (!quoteRequests.length) return;
    let cancelled = false;

    const loadQuotes = async () => {
      setQuoteLoading(true);
      setQuotedCount(0);
      const missing = quoteRequests.filter((request) => quotes[request.key] === undefined);

      for (let index = 0; index < missing.length; index += BATCH_SIZE) {
        const batch = missing.slice(index, index + BATCH_SIZE);
        const entries = await Promise.all(batch.map(async (request) => {
          try {
            const quote = request.type === 'buy'
              ? await getCraftworldBuyQuote({ inputSymbol: 'COIN', outputSymbol: request.symbol, outputAmount: request.amount })
              : await getCraftworldQuote({ inputSymbol: request.symbol, outputSymbol: 'COIN', inputAmount: request.amount });
            return [request.key, quote] as const;
          } catch {
            return [request.key, null] as const;
          }
        }));

        if (cancelled) return;
        setQuotes((current) => ({ ...current, ...Object.fromEntries(entries) }));
        setQuotedCount((current) => current + entries.length);
      }

      if (!cancelled) setQuoteLoading(false);
    };

    loadQuotes();
    return () => {
      cancelled = true;
    };
  }, [quoteRequests]);

  const currentPnl = useMemo(() => calculateRecipePnl(currentRow, quotes), [currentRow, quotes]);
  const targetPnl = useMemo(() => calculateRecipePnl(targetRow, quotes), [targetRow, quotes]);

  const upgradeSteps = useMemo<UpgradeStep[]>(() => upgradeRows.map((step) => {
    const quote = quotes[buyKey(step.row.upgrade_token, step.totalAmount)] || null;
    return {
      fromLevel: step.fromLevel,
      toLevel: step.toLevel,
      token: step.row.upgrade_token,
      amountPerFactory: step.row.upgrade_amount,
      totalAmount: step.totalAmount,
      quote,
      cost: quote?.input.amount || 0,
      impact: quote?.details?.priceImpactPercentage || 0,
      missingQuote: !quote,
    };
  }), [quotes, upgradeRows]);

  const totalUpgradeCost = upgradeSteps.reduce((total, step) => total + step.cost, 0);
  const totalUpgradeMissing = upgradeSteps.some((step) => step.missingQuote);
  const currentTotalProfitPerHour = currentPnl.profitPerHour * factoryCount;
  const targetTotalProfitPerHour = targetPnl.profitPerHour * factoryCount;
  const pnlGainPerHour = targetTotalProfitPerHour - currentTotalProfitPerHour;
  const breakEvenHours = totalUpgradeCost > 0 && pnlGainPerHour > 0 ? totalUpgradeCost / pnlGainPerHour : Number.POSITIVE_INFINITY;

  const upgradeTotalsByToken = useMemo(() => upgradeSteps.reduce<Record<string, number>>((acc, step) => {
    if (!step.token) return acc;
    acc[step.token] = (acc[step.token] || 0) + step.totalAmount;
    return acc;
  }, {}), [upgradeSteps]);

  function handleFactoryTypeChange(value: string) {
    const nextLevels = getLevels(rows, value);
    setFactoryType(value);
    setCurrentLevel(nextLevels[0] || 1);
    setTargetLevel(nextLevels[1] || nextLevels[0] || 1);
  }

  if (loading) {
    return (
      <Layout>
        <Card title="Calculator">Loading calculator...</Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card title="Factory Upgrade Calculator">
          <div className="space-y-3 text-sm">
            <p className="text-slate-300">
              Pick a factory, current level, target level, and number of factories. This estimates total upgrade materials, upgrade buy cost, current PNL, target PNL, gain per hour, and break even time.
            </p>
            <p className="text-yellow-200">
              Inputs use buy quotes, COIN to resource. Outputs use sell quotes, resource to COIN. This page uses base CSV recipe math without workshop boosts, active boosts, or mastery modifiers.
            </p>
            {error && <p className="text-red-300">{error}</p>}
            {quoteLoading && <p className="text-slate-400">Loading quotes... {quotedCount}/{quoteRequests.length} checked.</p>}

            <div className="grid gap-3 md:grid-cols-5">
              <label className="space-y-1">
                <span>Factory Type</span>
                <select value={factoryType} onChange={(event) => handleFactoryTypeChange(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2">
                  {factoryTypes.map((token) => <option key={token} value={token}>{token}</option>)}
                </select>
              </label>

              <label className="space-y-1">
                <span>Factory Count</span>
                <input value={factoryCount} onChange={(event) => setFactoryCount(Math.max(1, Math.floor(numberInput(event.target.value))))} type="number" min="1" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" />
              </label>

              <label className="space-y-1">
                <span>Current Level</span>
                <select value={currentLevel} onChange={(event) => setCurrentLevel(Number(event.target.value))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2">
                  {levels.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>

              <label className="space-y-1">
                <span>Target Level</span>
                <select value={targetLevel} onChange={(event) => setTargetLevel(Number(event.target.value))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2">
                  {levels.filter((level) => level >= currentLevel).map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                <p className="text-slate-400">Levels Planned</p>
                <p className="text-lg font-semibold">{Math.max(targetLevel - currentLevel, 0)}</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Upgrade Summary">
            <div className="space-y-2 text-sm">
              <p>Total Upgrade Cost: {totalUpgradeMissing ? 'Waiting for quotes' : `${fmt(totalUpgradeCost)} COIN`}</p>
              <p>Current Total PNL/Hr: {currentPnl.missingQuote ? 'Waiting' : `${fmt(currentTotalProfitPerHour)} COIN`}</p>
              <p>Target Total PNL/Hr: {targetPnl.missingQuote ? 'Waiting' : `${fmt(targetTotalProfitPerHour)} COIN`}</p>
              <p>Gain Per Hour: {currentPnl.missingQuote || targetPnl.missingQuote ? 'Waiting' : `${fmt(pnlGainPerHour)} COIN`}</p>
              <p>Break Even: {Number.isFinite(breakEvenHours) ? `${fmt(breakEvenHours, 2)} hours` : 'Not profitable or waiting'}</p>
            </div>
          </Card>

          <Card title="Upgrade Amounts Needed">
            <div className="space-y-2 text-sm">
              {Object.keys(upgradeTotalsByToken).length ? Object.entries(upgradeTotalsByToken).map(([token, amount]) => (
                <p key={token}>{fmt(amount)} {token}</p>
              )) : <p className="text-slate-400">No upgrade material needed for this range.</p>}
            </div>
          </Card>

          <Card title="PNL Delta">
            <div className="space-y-2 text-sm">
              <p>Current Profit/Run: {currentPnl.missingQuote ? 'Waiting' : `${fmt(currentPnl.profitPerRun)} COIN`}</p>
              <p>Target Profit/Run: {targetPnl.missingQuote ? 'Waiting' : `${fmt(targetPnl.profitPerRun)} COIN`}</p>
              <p>Current Runs/Hr: {fmt(currentPnl.runsPerHour, 4)}</p>
              <p>Target Runs/Hr: {fmt(targetPnl.runsPerHour, 4)}</p>
              <p>Per Factory PNL Gain/Hr: {currentPnl.missingQuote || targetPnl.missingQuote ? 'Waiting' : `${fmt(targetPnl.profitPerHour - currentPnl.profitPerHour)} COIN`}</p>
            </div>
          </Card>
        </div>

        <Card title="Current Recipe Quotes">
          <div className="space-y-2 text-sm">
            {currentRow ? (
              <>
                <p>Current Recipe: {factoryType} Level {currentLevel}</p>
                <QuoteLine label="Output Sell Value" quote={quotes[sellKey(currentRow.output_token, currentRow.output_amount)]} />
                {currentRow.input_token_1 && <QuoteLine label="Input 1 Buy Cost" quote={quotes[buyKey(currentRow.input_token_1, currentRow.input_amount_1)]} />}
                {currentRow.input_token_2 && <QuoteLine label="Input 2 Buy Cost" quote={quotes[buyKey(currentRow.input_token_2, currentRow.input_amount_2)]} />}
              </>
            ) : <p className="text-slate-400">No current row found.</p>}
          </div>
        </Card>

        <Card title="Target Recipe Quotes">
          <div className="space-y-2 text-sm">
            {targetRow ? (
              <>
                <p>Target Recipe: {factoryType} Level {targetLevel}</p>
                <QuoteLine label="Output Sell Value" quote={quotes[sellKey(targetRow.output_token, targetRow.output_amount)]} />
                {targetRow.input_token_1 && <QuoteLine label="Input 1 Buy Cost" quote={quotes[buyKey(targetRow.input_token_1, targetRow.input_amount_1)]} />}
                {targetRow.input_token_2 && <QuoteLine label="Input 2 Buy Cost" quote={quotes[buyKey(targetRow.input_token_2, targetRow.input_amount_2)]} />}
              </>
            ) : <p className="text-slate-400">No target row found.</p>}
          </div>
        </Card>

        <Card title="Upgrade Path">
          {upgradeSteps.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="p-2">Step</th>
                    <th className="p-2">Upgrade Token</th>
                    <th className="p-2">Amount Per Factory</th>
                    <th className="p-2">Total Amount</th>
                    <th className="p-2">Buy Cost</th>
                    <th className="p-2">Impact</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {upgradeSteps.map((step) => (
                    <tr key={`${step.fromLevel}-${step.toLevel}-${step.token}`} className="border-t border-slate-800">
                      <td className="p-2">Lv {step.fromLevel} → Lv {step.toLevel}</td>
                      <td className="p-2">{step.token}</td>
                      <td className="p-2">{fmt(step.amountPerFactory)} {step.token}</td>
                      <td className="p-2">{fmt(step.totalAmount)} {step.token}</td>
                      <td className="p-2">{step.missingQuote ? 'Waiting' : `${fmt(step.cost)} COIN`}</td>
                      <td className="p-2">{step.missingQuote ? 'Waiting' : `${fmt(step.impact, 2)}%`}</td>
                      <td className="p-2">{step.missingQuote ? 'Waiting for quote' : 'Ready'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-slate-400">No upgrade steps found for this range.</p>}
        </Card>
      </div>
    </Layout>
  );
}
