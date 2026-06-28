import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { getCraftworldHome } from '../services/api';
import { formatDurationFromMinutes, getDurationMinutesFromRunsPerHour } from '../services/durationFormat';
import { type FactoryBoost } from '../services/factoryBoostModifiers';
import { loadFactoryData, type FactoryDataRow } from '../services/factoryData';
import {
  buildRecipeTree,
  calculateProductionPerHour,
  calculateTimeUntilResources,
  flattenRecipeToBaseResources,
  type RecipeNode,
} from '../services/craftworldCalculations';
import { type WorkshopItem } from '../services/workshopModifiers';

type ResourceAmount = { symbol?: string; amount?: number };
type OwnedFactory = { id?: string; areaSymbol?: string; level?: number; landPlotName?: string; currentRunLevel?: number; activeBoosts?: FactoryBoost[] };
type HomeData = { factories?: OwnedFactory[]; inventory?: ResourceAmount[]; workshop?: WorkshopItem[]; lastSyncedAt?: string };

type PlannerResult = {
  selectedRow: FactoryDataRow | null;
  selectedToken: string;
  selectedLevel: number;
  targetAmount: number;
  ownedAmount: number;
  neededAmount: number;
  producer: OwnedFactory | null;
  producerRow: FactoryDataRow | null;
  outputPerHour: number;
  outputPerDay: number;
  etaMinutes: number;
  recipeTree: RecipeNode | null;
  baseResources: Record<string, number>;
};

function fmt(value: number, digits = 3) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0';
}

function inventoryMap(items: ResourceAmount[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const symbol = String(item.symbol || '').trim().toUpperCase();
    const amount = Number(item.amount || 0);
    if (symbol) acc[symbol] = (acc[symbol] || 0) + (Number.isFinite(amount) ? amount : 0);
    return acc;
  }, {});
}

function getDisplayLevel(factory: OwnedFactory) {
  return typeof factory.currentRunLevel === 'number'
    ? factory.currentRunLevel + 1
    : typeof factory.level === 'number'
      ? factory.level + 1
      : 0;
}

function getBestOwnedProducer(factories: OwnedFactory[], rows: FactoryDataRow[], outputToken: string) {
  const token = outputToken.trim().toUpperCase();
  const matches = factories
    .map((factory) => {
      const symbol = String(factory.areaSymbol || '').trim().toUpperCase();
      const level = getDisplayLevel(factory);
      const row = rows.find((item) => item.token === symbol && item.level === level && item.output_token === token) || null;
      return row ? { factory, row } : null;
    })
    .filter((value): value is { factory: OwnedFactory; row: FactoryDataRow } => Boolean(value));

  return matches.sort((a, b) => b.row.output_amount - a.row.output_amount || b.row.level - a.row.level)[0] || null;
}

function getOutputPerHour(row: FactoryDataRow | null, factory: OwnedFactory | null, workshop: WorkshopItem[]) {
  if (!row || !factory) return 0;
  return calculateProductionPerHour(row, { workshop, activeBoosts: factory.activeBoosts || [] });
}

function uniqueTokens(rows: FactoryDataRow[]) {
  return Array.from(new Set(rows.map((row) => row.output_token).filter(Boolean))).sort();
}

function levelsForToken(rows: FactoryDataRow[], token: string) {
  return rows
    .filter((row) => row.output_token === token)
    .map((row) => row.level)
    .filter((level, index, levels) => levels.indexOf(level) === index)
    .sort((a, b) => a - b);
}

function buildPlannerResult(
  rows: FactoryDataRow[],
  home: HomeData | null,
  selectedToken: string,
  selectedLevel: number,
  amountInput: string,
): PlannerResult {
  const targetAmount = Math.max(Number(amountInput || 0), 0);
  const inventory = inventoryMap(home?.inventory || []);
  const ownedAmount = inventory[selectedToken] || 0;
  const neededAmount = Math.max(targetAmount - ownedAmount, 0);
  const selectedRow = rows.find((row) => row.output_token === selectedToken && row.level === selectedLevel) || null;
  const producerMatch = getBestOwnedProducer(home?.factories || [], rows, selectedToken);
  const outputPerHour = getOutputPerHour(producerMatch?.row || null, producerMatch?.factory || null, home?.workshop || []);
  const eta = calculateTimeUntilResources(targetAmount, ownedAmount, outputPerHour);
  const recipeTree = selectedRow ? buildRecipeTree(rows, selectedToken, 1, selectedLevel) : null;
  const baseResources = recipeTree ? flattenRecipeToBaseResources(recipeTree) : {};

  return {
    selectedRow,
    selectedToken,
    selectedLevel,
    targetAmount,
    ownedAmount,
    neededAmount,
    producer: producerMatch?.factory || null,
    producerRow: producerMatch?.row || null,
    outputPerHour,
    outputPerDay: outputPerHour * 24,
    etaMinutes: Number.isFinite(eta.hours) ? eta.hours * 60 : Number.POSITIVE_INFINITY,
    recipeTree,
    baseResources,
  };
}

function RecipeTreeView({ node }: { node: RecipeNode }) {
  return (
    <div className="space-y-1">
      <p>
        {fmt(node.amount)} {node.token}
        {node.circular ? ' (circular recipe protected)' : ''}
        {node.missingRecipe ? ' (base or missing recipe)' : ''}
      </p>
      {node.children.length > 0 && (
        <div className="ml-4 border-l border-slate-800 pl-3">
          {node.children.map((child, index) => (
            <RecipeTreeView key={`${child.token}-${index}`} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResourcePlanner() {
  const [rows, setRows] = useState<FactoryDataRow[]>([]);
  const [home, setHome] = useState<HomeData | null>(null);
  const [selectedToken, setSelectedToken] = useState('');
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [amountInput, setAmountInput] = useState('100');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [factoryRows, homeData] = await Promise.all([loadFactoryData(), getCraftworldHome()]);
      setRows(factoryRows);
      setHome(homeData || {});
      const tokens = uniqueTokens(factoryRows);
      setSelectedToken((current) => current || tokens[0] || '');
    } catch {
      setError('Unable to load resource planner data. Refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const tokens = useMemo(() => uniqueTokens(rows), [rows]);
  const availableLevels = useMemo(() => levelsForToken(rows, selectedToken), [rows, selectedToken]);

  useEffect(() => {
    if (!availableLevels.length) return;
    if (!availableLevels.includes(selectedLevel)) setSelectedLevel(availableLevels[0]);
  }, [availableLevels, selectedLevel]);

  const result = useMemo(
    () => buildPlannerResult(rows, home, selectedToken, selectedLevel, amountInput),
    [amountInput, home, rows, selectedLevel, selectedToken],
  );

  const runtimeText = result.producerRow && result.outputPerHour > 0
    ? formatDurationFromMinutes(getDurationMinutesFromRunsPerHour(result.outputPerHour / result.producerRow.output_amount))
    : 'Not producing';
  const lastSynced = home?.lastSyncedAt ? new Date(home.lastSyncedAt).toLocaleString() : 'Not connected';

  if (loading) {
    return (
      <Layout>
        <Card title="Resource Planner">Loading planner data...</Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card title="Resource Planner">
          <div className="space-y-4">
            <div className="space-y-1 text-sm text-slate-300">
              <p>Choose the resource, choose the factory level, then type the amount you want.</p>
              <p className="text-slate-400">Last synced: {lastSynced}</p>
              {error && <p className="text-red-300">{error}</p>}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Resource</span>
                <select
                  value={selectedToken}
                  onChange={(event) => setSelectedToken(event.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                >
                  {tokens.map((token) => <option key={token} value={token}>{token}</option>)}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Factory Level</span>
                <select
                  value={selectedLevel}
                  onChange={(event) => setSelectedLevel(Number(event.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                >
                  {availableLevels.map((level) => <option key={level} value={level}>Level {level}</option>)}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Amount Wanted</span>
                <input
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  inputMode="decimal"
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                  placeholder="100"
                />
              </label>
            </div>
          </div>
        </Card>

        <div className="grid gap-3 md:grid-cols-4">
          <Card title="Want">{fmt(result.targetAmount)} {result.selectedToken}</Card>
          <Card title="Own">{fmt(result.ownedAmount)} {result.selectedToken}</Card>
          <Card title="Still Need">{fmt(result.neededAmount)} {result.selectedToken}</Card>
          <Card title="ETA">{result.neededAmount <= 0 ? 'Ready now' : result.outputPerHour > 0 ? formatDurationFromMinutes(result.etaMinutes) : 'No producer'}</Card>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="Production Source">
            {result.producer && result.producerRow ? (
              <div className="space-y-2 text-sm">
                <p className="text-lg font-semibold">{result.producer.landPlotName || 'Unknown plot'} • {result.producerRow.token}</p>
                <p>Current producing level: {result.producerRow.level}</p>
                <p>Runtime: {runtimeText}</p>
                <p>{fmt(result.outputPerHour)} {result.selectedToken}/hr</p>
                <p>{fmt(result.outputPerDay)} {result.selectedToken}/day</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">You do not currently have a matched factory producing {result.selectedToken}.</p>
            )}
          </Card>

          <Card title="Recipe Tree / Base Resources">
            {result.selectedRow ? (
              <div className="space-y-2 text-sm">
                <p className="text-lg font-semibold">{result.selectedRow.token} • Level {result.selectedRow.level}</p>
                <p>Output: {fmt(result.selectedRow.output_amount)} {result.selectedRow.output_token}</p>
                <p>Base runtime: {formatDurationFromMinutes(result.selectedRow.duration_min)}</p>
                <p>Input: {fmt(result.selectedRow.input_amount_1)} {result.selectedRow.input_token_1}</p>
                {result.selectedRow.input_token_2 && result.selectedRow.input_amount_2 > 0 && (
                  <p>Input 2: {fmt(result.selectedRow.input_amount_2)} {result.selectedRow.input_token_2}</p>
                )}
                <p>Next upgrade: {fmt(result.selectedRow.upgrade_amount)} {result.selectedRow.upgrade_token}</p>
                {result.recipeTree && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <RecipeTreeView node={result.recipeTree} />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-slate-200">Base resources for 1 unit</p>
                  {Object.entries(result.baseResources).map(([token, amount]) => (
                    <p key={token}>{fmt(amount)} {token}</p>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No recipe row found for that dropdown selection.</p>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
