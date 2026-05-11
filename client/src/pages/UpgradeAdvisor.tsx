import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { getCraftworldBuyQuote, getCraftworldHome, getCraftworldQuote } from '../services/api';
import { loadFactoryData, type FactoryDataRow } from '../services/factoryData';
import { applyMasteryInputReduction, getMasteryInputReductionPercent, type ProficiencyItem } from '../services/masteryModifiers';
import { getRunsPerHourWithWorkshop, getWorkshopSpeedBoostPercent, type WorkshopItem } from '../services/workshopModifiers';

type OwnedFactory = { id?: string; areaSymbol?: string; level?: number; landPlotName?: string };
type ResourceAmount = { symbol?: string; amount?: number };
type Quote = { input: { symbol: string; amount: number }; output: { symbol: string; amount: number }; details?: { priceImpactPercentage?: number } };
type QuoteMap = Record<string, Quote | null>;

type FactoryOption = {
  key: string;
  symbol: string;
  plotName: string;
  level: number;
  nextLevel: number;
  currentRow: FactoryDataRow;
  nextRow: FactoryDataRow;
};

type AdvisorRow = {
  option: FactoryOption;
  needToken: string;
  needAmount: number;
  ownAmount: number;
  gapAmount: number;
  buyCost: number | null;
  craftCost: number | null;
  bestCost: number | null;
  bestChoice: string;
  gainPerHour: number;
  currentProfitPerHour: number;
  nextProfitPerHour: number;
  workshopBoostPercent: number;
  currentMasteryText: string;
  nextMasteryText: string;
  breakEvenHours: number;
  impact: number;
  ready: boolean;
};

const BATCH_SIZE = 12;

function sellKey(symbol: string, amount: number) {
  return `SELL:${symbol.toUpperCase()}:${amount}`;
}

function buyKey(symbol: string, amount: number) {
  return `BUY:COIN:${symbol.toUpperCase()}:${amount}`;
}

function fmt(value: number, digits = 6) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0';
}

function fmtHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return 'Not profitable';
  if (hours < 1) return `${fmt(hours * 60, 1)} min`;
  if (hours < 24) return `${fmt(hours, 2)} hr`;
  return `${fmt(hours / 24, 2)} days`;
}

function rowLabel(option: FactoryOption) {
  return `${option.plotName} • ${option.symbol} • Lv ${option.level} → Lv ${option.nextLevel}`;
}

function inventoryMap(items: ResourceAmount[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const symbol = String(item.symbol || '').trim().toUpperCase();
    const amount = Number(item.amount || 0);
    if (symbol && amount > 0) acc[symbol] = (acc[symbol] || 0) + amount;
    return acc;
  }, {});
}

function adjustedInputAmount(symbol: string, amount: number, proficiencies: ProficiencyItem[]) {
  return applyMasteryInputReduction(amount, symbol, proficiencies);
}

function masteryText(row: FactoryDataRow, proficiencies: ProficiencyItem[]) {
  const first = getMasteryInputReductionPercent(row.input_token_1, proficiencies);
  const second = row.input_token_2 ? getMasteryInputReductionPercent(row.input_token_2, proficiencies) : null;
  return second === null ? `${fmt(first, 2)}%` : `${fmt(first, 2)}% / ${fmt(second, 2)}%`;
}

function recipeRequests(row: FactoryDataRow | null | undefined, proficiencies: ProficiencyItem[]) {
  if (!row) return [] as Array<{ type: 'sell'; symbol: string; amount: number; key: string }>;
  const input1Amount = adjustedInputAmount(row.input_token_1, row.input_amount_1, proficiencies);
  const requests = [
    { type: 'sell' as const, symbol: row.output_token, amount: row.output_amount, key: sellKey(row.output_token, row.output_amount) },
    { type: 'sell' as const, symbol: row.input_token_1, amount: input1Amount, key: sellKey(row.input_token_1, input1Amount) },
  ];
  if (row.input_token_2 && row.input_amount_2 > 0) {
    const input2Amount = adjustedInputAmount(row.input_token_2, row.input_amount_2, proficiencies);
    requests.push({ type: 'sell' as const, symbol: row.input_token_2, amount: input2Amount, key: sellKey(row.input_token_2, input2Amount) });
  }
  return requests;
}

function recipeProfitPerHour(row: FactoryDataRow, quotes: QuoteMap, workshop: WorkshopItem[], proficiencies: ProficiencyItem[]) {
  const input1Amount = adjustedInputAmount(row.input_token_1, row.input_amount_1, proficiencies);
  const input2Amount = row.input_token_2 ? adjustedInputAmount(row.input_token_2, row.input_amount_2, proficiencies) : 0;
  const output = quotes[sellKey(row.output_token, row.output_amount)] || null;
  const input1 = quotes[sellKey(row.input_token_1, input1Amount)] || null;
  const input2 = row.input_token_2 ? quotes[sellKey(row.input_token_2, input2Amount)] || null : null;
  const missing = !output || !input1 || Boolean(row.input_token_2 && !input2);
  if (missing) return { value: 0, missing: true, impact: 0 };

  const inputCost = input1.output.amount + (input2?.output.amount || 0);
  const profitPerRun = output.output.amount - inputCost;
  const runsPerHour = getRunsPerHourWithWorkshop(row.duration_min, row.token, workshop);
  const impact = Math.max(
    output.details?.priceImpactPercentage || 0,
    input1.details?.priceImpactPercentage || 0,
    input2?.details?.priceImpactPercentage || 0,
  );

  return { value: profitPerRun * runsPerHour, missing: false, impact };
}

function craftCostForGap(producerRow: FactoryDataRow | null, gapAmount: number, quotes: QuoteMap, proficiencies: ProficiencyItem[]) {
  if (!producerRow || gapAmount <= 0 || producerRow.output_amount <= 0) return { cost: null as number | null, missing: false, impact: 0 };

  const input1Amount = adjustedInputAmount(producerRow.input_token_1, producerRow.input_amount_1, proficiencies);
  const input2Amount = producerRow.input_token_2 ? adjustedInputAmount(producerRow.input_token_2, producerRow.input_amount_2, proficiencies) : 0;
  const input1 = quotes[sellKey(producerRow.input_token_1, input1Amount)] || null;
  const input2 = producerRow.input_token_2 ? quotes[sellKey(producerRow.input_token_2, input2Amount)] || null : null;
  const missing = !input1 || Boolean(producerRow.input_token_2 && !input2);
  if (missing) return { cost: null, missing: true, impact: 0 };

  const costPerRun = input1.output.amount + (input2?.output.amount || 0);
  const runMultiplier = gapAmount / producerRow.output_amount;
  const impact = Math.max(input1.details?.priceImpactPercentage || 0, input2?.details?.priceImpactPercentage || 0);

  return { cost: costPerRun * runMultiplier, missing: false, impact };
}

export default function UpgradeAdvisor() {
  const [rows, setRows] = useState<FactoryDataRow[]>([]);
  const [ownedFactories, setOwnedFactories] = useState<OwnedFactory[]>([]);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [workshop, setWorkshop] = useState<WorkshopItem[]>([]);
  const [proficiencies, setProficiencies] = useState<ProficiencyItem[]>([]);
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
        const [factoryRows, homeData] = await Promise.all([loadFactoryData(), getCraftworldHome()]);
        setRows(factoryRows);
        setOwnedFactories(homeData.factories || []);
        setInventory(inventoryMap(homeData.inventory || []));
        setWorkshop(homeData.workshop || []);
        setProficiencies(homeData.proficiencies || []);
      } catch {
        setError('Unable to load upgrade advisor data. Refresh and try again.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const options = useMemo<FactoryOption[]>(() => {
    return ownedFactories
      .map((factory, index) => {
        const symbol = String(factory.areaSymbol || '').trim().toUpperCase();
        const level = typeof factory.level === 'number' ? factory.level + 1 : 0;
        const nextLevel = level + 1;
        const currentRow = rows.find((row) => row.token === symbol && row.level === level);
        const nextRow = rows.find((row) => row.token === symbol && row.level === nextLevel);
        if (!symbol || !currentRow || !nextRow) return null;
        return {
          key: factory.id || `${factory.landPlotName || 'plot'}-${symbol}-${level}-${index}`,
          symbol,
          plotName: factory.landPlotName || 'Unknown plot',
          level,
          nextLevel,
          currentRow,
          nextRow,
        };
      })
      .filter((value): value is FactoryOption => Boolean(value));
  }, [ownedFactories, rows]);

  const producerRows = useMemo(() => {
    const map = new Map<string, FactoryDataRow>();
    ownedFactories.forEach((factory) => {
      const symbol = String(factory.areaSymbol || '').trim().toUpperCase();
      const level = typeof factory.level === 'number' ? factory.level + 1 : 0;
      const row = rows.find((item) => item.token === symbol && item.level === level);
      if (!symbol || !row) return;
      const best = map.get(symbol);
      if (!best || row.level > best.level) map.set(symbol, row);
    });
    return map;
  }, [ownedFactories, rows]);

  const quoteRequests = useMemo(() => {
    const map = new Map<string, { type: 'sell' | 'buy'; symbol: string; amount: number; key: string }>();

    options.forEach((option) => {
      [...recipeRequests(option.currentRow, proficiencies), ...recipeRequests(option.nextRow, proficiencies)].forEach((request) => map.set(request.key, request));

      const needToken = option.nextRow.upgrade_token;
      const needAmount = option.nextRow.upgrade_amount;
      const gapAmount = Math.max(needAmount - (inventory[needToken] || 0), 0);
      if (needToken && gapAmount > 0) {
        map.set(buyKey(needToken, gapAmount), { type: 'buy', symbol: needToken, amount: gapAmount, key: buyKey(needToken, gapAmount) });
      }

      recipeRequests(producerRows.get(needToken) || null, proficiencies).forEach((request) => map.set(request.key, request));
    });

    return Array.from(map.values());
  }, [inventory, options, producerRows, proficiencies]);

  useEffect(() => {
    if (!quoteRequests.length) return;
    let cancelled = false;

    const loadQuotes = async () => {
      setQuoteLoading(true);
      setQuotedCount(0);
      try {
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
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    };

    loadQuotes();
    return () => {
      cancelled = true;
    };
  }, [quoteRequests]);

  const advisorRows = useMemo<AdvisorRow[]>(() => {
    return options.map((option) => {
      const current = recipeProfitPerHour(option.currentRow, quotes, workshop, proficiencies);
      const next = recipeProfitPerHour(option.nextRow, quotes, workshop, proficiencies);
      const needToken = option.nextRow.upgrade_token;
      const needAmount = option.nextRow.upgrade_amount;
      const ownAmount = inventory[needToken] || 0;
      const gapAmount = Math.max(needAmount - ownAmount, 0);
      const buyQuote = gapAmount > 0 ? quotes[buyKey(needToken, gapAmount)] || null : null;
      const buyCost = gapAmount > 0 ? buyQuote?.input.amount ?? null : 0;
      const craft = craftCostForGap(producerRows.get(needToken) || null, gapAmount, quotes, proficiencies);
      const costs = [buyCost, craft.cost].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      const bestCost = gapAmount === 0 ? 0 : costs.length ? Math.min(...costs) : null;
      const bestChoice = gapAmount === 0 ? 'Ready' : craft.cost !== null && (buyCost === null || craft.cost < buyCost) ? 'Craft' : buyCost !== null ? 'Buy' : 'Waiting';
      const gainPerHour = next.value - current.value;
      const breakEvenHours = bestCost !== null && gainPerHour > 0 ? bestCost / gainPerHour : Number.POSITIVE_INFINITY;
      const impact = Math.max(current.impact, next.impact, buyQuote?.details?.priceImpactPercentage || 0, craft.impact);
      const ready = !current.missing && !next.missing && bestCost !== null;

      return {
        option,
        needToken,
        needAmount,
        ownAmount,
        gapAmount,
        buyCost,
        craftCost: craft.cost,
        bestCost,
        bestChoice,
        gainPerHour,
        currentProfitPerHour: current.value,
        nextProfitPerHour: next.value,
        workshopBoostPercent: getWorkshopSpeedBoostPercent(option.symbol, workshop),
        currentMasteryText: masteryText(option.currentRow, proficiencies),
        nextMasteryText: masteryText(option.nextRow, proficiencies),
        breakEvenHours,
        impact,
        ready,
      };
    }).sort((a, b) => {
      if (a.ready !== b.ready) return a.ready ? -1 : 1;
      return a.breakEvenHours - b.breakEvenHours;
    });
  }, [inventory, options, producerRows, quotes, workshop, proficiencies]);

  const bestUpgrade = advisorRows.find((row) => row.ready && row.gainPerHour > 0) || null;

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
              This shows the material needed for the next upgrade, what you already own, what you are missing, and whether buying or crafting the missing amount is cheaper. Workshop speed boosts and mastery input reductions are included.
            </p>
            {quoteLoading && <p className="text-sm text-slate-400">Loading prices... {quotedCount}/{quoteRequests.length} quotes checked.</p>}
            {error && <p className="text-sm text-red-300">{error}</p>}
            {bestUpgrade ? (
              <div className="rounded-lg border border-emerald-400/70 bg-emerald-500/10 p-3 text-sm">
                <p className="font-semibold text-emerald-200">Best upgrade candidate</p>
                <p>{rowLabel(bestUpgrade.option)}</p>
                <p>Workshop speed boost: {fmt(bestUpgrade.workshopBoostPercent, 2)}%</p>
                <p>Current recipe mastery reductions: {bestUpgrade.currentMasteryText}</p>
                <p>Next recipe mastery reductions: {bestUpgrade.nextMasteryText}</p>
                <p>Need: {fmt(bestUpgrade.needAmount)} {bestUpgrade.needToken}</p>
                <p>Own: {fmt(bestUpgrade.ownAmount)} {bestUpgrade.needToken}</p>
                <p>Missing: {fmt(bestUpgrade.gapAmount)} {bestUpgrade.needToken}</p>
                <p>Buy cost: {bestUpgrade.buyCost === null ? 'Waiting' : `${fmt(bestUpgrade.buyCost)} COIN`}</p>
                <p>Craft cost: {bestUpgrade.craftCost === null ? 'Not available' : `${fmt(bestUpgrade.craftCost)} COIN`}</p>
                <p>Best choice: {bestUpgrade.bestChoice}</p>
                <p>Current profit per hour: {fmt(bestUpgrade.currentProfitPerHour)} COIN</p>
                <p>Next profit per hour: {fmt(bestUpgrade.nextProfitPerHour)} COIN</p>
                <p>Break even: {fmtHours(bestUpgrade.breakEvenHours)}</p>
              </div>
            ) : <p className="text-sm text-slate-400">No upgrade recommendation is ready yet.</p>}
          </div>
        </Card>

        <Card title="All Upgrade Candidates">
          {advisorRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1420px] text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="p-2">Rank</th>
                    <th className="p-2">Factory</th>
                    <th className="p-2">Workshop</th>
                    <th className="p-2">Mastery</th>
                    <th className="p-2">Need</th>
                    <th className="p-2">Own</th>
                    <th className="p-2">Missing</th>
                    <th className="p-2">Buy Cost</th>
                    <th className="p-2">Craft Cost</th>
                    <th className="p-2">Best Choice</th>
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
                      <td className="p-2">{rowLabel(row.option)}</td>
                      <td className="p-2">{fmt(row.workshopBoostPercent, 2)}%</td>
                      <td className="p-2">{row.currentMasteryText} → {row.nextMasteryText}</td>
                      <td className="p-2">{fmt(row.needAmount)} {row.needToken}</td>
                      <td className="p-2">{fmt(row.ownAmount)} {row.needToken}</td>
                      <td className="p-2">{fmt(row.gapAmount)} {row.needToken}</td>
                      <td className="p-2">{row.buyCost === null ? 'Waiting' : `${fmt(row.buyCost)} COIN`}</td>
                      <td className="p-2">{row.craftCost === null ? 'Not available' : `${fmt(row.craftCost)} COIN`}</td>
                      <td className="p-2 font-semibold">{row.bestChoice}</td>
                      <td className="p-2">{row.ready ? `${fmt(row.currentProfitPerHour)} COIN` : 'Waiting'}</td>
                      <td className="p-2">{row.ready ? `${fmt(row.nextProfitPerHour)} COIN` : 'Waiting'}</td>
                      <td className={row.gainPerHour >= 0 ? 'p-2 text-emerald-300' : 'p-2 text-red-300'}>{row.ready ? `${fmt(row.gainPerHour)} COIN` : 'Waiting'}</td>
                      <td className="p-2">{row.ready ? fmtHours(row.breakEvenHours) : 'Waiting'}</td>
                      <td className="p-2">{row.ready ? `${fmt(row.impact, 2)}%` : 'Waiting'}</td>
                      <td className="p-2">{row.ready ? row.gainPerHour > 0 ? 'Candidate' : 'Not worth it yet' : 'Waiting for quotes'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-slate-400">No upgrade candidates were found yet.</p>}
        </Card>
      </div>
    </Layout>
  );
}
