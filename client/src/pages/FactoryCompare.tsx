import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import {
  calculateFactoryCycle,
  type FactoryDataRow,
  type PriceMap,
} from '../services/craftworldCalculations';
import { formatDurationFromMinutes } from '../services/durationFormat';
import { loadFactoryData } from '../services/factoryData';

function fmt(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Missing data';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function rowKey(row: FactoryDataRow) {
  return `${row.token}:${row.level}`;
}

function rowLabel(row: FactoryDataRow) {
  return `${row.token} Lv ${row.level} -> ${row.output_token}`;
}

function parsePrices(raw: Record<string, string>): PriceMap {
  return Object.entries(raw).reduce<PriceMap>((acc, [symbol, value]) => {
    const parsed = Number(value);
    if (symbol && Number.isFinite(parsed) && parsed > 0) acc[symbol] = parsed;
    return acc;
  }, {});
}

function winner<T extends { key: string }>(rows: T[], getValue: (row: T) => number, lowerIsBetter = false) {
  const usable = rows.filter((row) => Number.isFinite(getValue(row)));
  if (!usable.length) return '';
  return [...usable].sort((a, b) => lowerIsBetter ? getValue(a) - getValue(b) : getValue(b) - getValue(a))[0].key;
}

export default function FactoryCompare() {
  const [rows, setRows] = useState<FactoryDataRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const factoryRows = await loadFactoryData();
        setRows(factoryRows);
        setSelectedKeys(factoryRows.slice(0, 4).map(rowKey));
      } catch {
        setError('Unable to load factory comparison data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const selectedRows = useMemo(() => {
    return selectedKeys
      .map((key) => rows.find((row) => rowKey(row) === key))
      .filter((row): row is FactoryDataRow => Boolean(row));
  }, [rows, selectedKeys]);

  const tokens = useMemo(() => {
    return Array.from(new Set(selectedRows.flatMap((row) => [row.output_token, row.input_token_1, row.input_token_2].filter(Boolean)))).sort();
  }, [selectedRows]);

  const priceMap = useMemo(() => parsePrices(priceInputs), [priceInputs]);

  const comparisonRows = useMemo(() => {
    return selectedRows.map((row) => {
      const cycle = calculateFactoryCycle(row, priceMap);
      return { key: rowKey(row), row, cycle };
    });
  }, [priceMap, selectedRows]);

  const winners = {
    runtime: winner(comparisonRows, (item) => item.cycle.runtimeMinutes, true),
    outputHour: winner(comparisonRows, (item) => item.cycle.outputPerHour),
    profitHour: winner(comparisonRows.filter((item) => !item.cycle.missingPrices.length), (item) => item.cycle.profitPerHour),
    margin: winner(comparisonRows.filter((item) => item.cycle.marginPercent !== null), (item) => item.cycle.marginPercent || 0),
  };

  function updateSelected(index: number, key: string) {
    const next = [...selectedKeys];
    next[index] = key;
    setSelectedKeys(Array.from(new Set(next)).slice(0, 4));
  }

  if (loading) {
    return (
      <Layout>
        <Card title="Factory Compare">Loading comparison data...</Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card title="Factory Compare">
          <div className="space-y-3 text-sm">
            <p className="text-slate-300">
              Compare 2 to 4 factory rows. Runtime, production, inputs, and profit all come from the shared calculation core.
            </p>
            {error && <p className="text-red-300">{error}</p>}
            <div className="grid gap-3 md:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <label key={index} className="space-y-1">
                  <span>Factory {index + 1}</span>
                  <select
                    value={selectedKeys[index] || ''}
                    onChange={(event) => updateSelected(index, event.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                  >
                    <option value="">None</option>
                    {rows.map((row) => <option key={rowKey(row)} value={rowKey(row)}>{rowLabel(row)}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        </Card>

        <Card title="COIN Prices">
          <div className="grid gap-3 text-sm md:grid-cols-4">
            {tokens.length ? tokens.map((token) => (
              <label key={token} className="space-y-1">
                <span>{token} / COIN</span>
                <input
                  value={priceInputs[token] || ''}
                  onChange={(event) => setPriceInputs((current) => ({ ...current, [token]: event.target.value }))}
                  inputMode="decimal"
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                  placeholder="optional"
                />
              </label>
            )) : <p className="text-slate-400">Pick factories to enter optional prices.</p>}
          </div>
        </Card>

        <Card title="Comparison">
          {comparisonRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="p-2">Factory</th>
                    <th className="p-2">Runtime</th>
                    <th className="p-2">Output / Hr</th>
                    <th className="p-2">Output / Day</th>
                    <th className="p-2">Input Cost</th>
                    <th className="p-2">Revenue</th>
                    <th className="p-2">Profit / Cycle</th>
                    <th className="p-2">Profit / Hr</th>
                    <th className="p-2">Margin</th>
                    <th className="p-2">Input Dependency</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map(({ key, row, cycle }) => (
                    <tr key={key} className="border-t border-slate-800">
                      <td className="p-2 font-semibold">{rowLabel(row)}</td>
                      <td className="p-2">
                        {formatDurationFromMinutes(cycle.runtimeMinutes)}
                        {winners.runtime === key && <span className="ml-2 rounded bg-emerald-600 px-2 py-0.5 text-xs">Winner</span>}
                      </td>
                      <td className="p-2">
                        {fmt(cycle.outputPerHour)} {row.output_token}
                        {winners.outputHour === key && <span className="ml-2 rounded bg-emerald-600 px-2 py-0.5 text-xs">Winner</span>}
                      </td>
                      <td className="p-2">{fmt(cycle.outputPerDay)} {row.output_token}</td>
                      <td className="p-2">{cycle.missingPrices.length ? 'Missing prices' : `${fmt(cycle.inputCostPerCycle)} COIN`}</td>
                      <td className="p-2">{cycle.missingPrices.length ? 'Missing prices' : `${fmt(cycle.revenuePerCycle)} COIN`}</td>
                      <td className={cycle.profitPerCycle >= 0 ? 'p-2 text-emerald-300' : 'p-2 text-red-300'}>
                        {cycle.missingPrices.length ? 'Missing prices' : `${fmt(cycle.profitPerCycle)} COIN`}
                      </td>
                      <td className={cycle.profitPerHour >= 0 ? 'p-2 text-emerald-300' : 'p-2 text-red-300'}>
                        {cycle.missingPrices.length ? 'Missing prices' : `${fmt(cycle.profitPerHour)} COIN`}
                        {winners.profitHour === key && <span className="ml-2 rounded bg-emerald-600 px-2 py-0.5 text-xs">Winner</span>}
                      </td>
                      <td className="p-2">
                        {cycle.marginPercent === null || cycle.missingPrices.length ? 'Missing prices' : `${fmt(cycle.marginPercent, 2)}%`}
                        {winners.margin === key && <span className="ml-2 rounded bg-emerald-600 px-2 py-0.5 text-xs">Winner</span>}
                      </td>
                      <td className="p-2">
                        {fmt(cycle.input1PerCycle)} {row.input_token_1}
                        {row.input_token_2 ? ` + ${fmt(cycle.input2PerCycle)} ${row.input_token_2}` : ''}
                      </td>
                      <td className="p-2">{cycle.missingPrices.length ? `Missing ${cycle.missingPrices.join(', ')}` : 'Ready'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Pick at least one factory.</p>
          )}
        </Card>
      </div>
    </Layout>
  );
}
