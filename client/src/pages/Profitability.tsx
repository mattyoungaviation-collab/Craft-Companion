import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { getCraftworldHome } from '../services/api';
import { loadFactoryData, type FactoryDataRow } from '../services/factoryData';

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

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0';
}

function formatFactoryLabel(option: OwnedFactoryOption) {
  const craftLevel = option.craftDisplayLevel ? ` • Craft Lv ${option.craftDisplayLevel}` : '';
  return `${option.plotName} • ${option.symbol} • Lv ${option.displayLevel}${craftLevel}`;
}

export default function Profitability() {
  const [rows, setRows] = useState<FactoryDataRow[]>([]);
  const [ownedFactories, setOwnedFactories] = useState<OwnedFactory[]>([]);
  const [selectedFactoryKey, setSelectedFactoryKey] = useState('');
  const [outputPrice, setOutputPrice] = useState(0);
  const [input1Price, setInput1Price] = useState(0);
  const [input2Price, setInput2Price] = useState(0);
  const [upgradePrice, setUpgradePrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const inputCost = (selectedRow?.input_amount_1 || 0) * input1Price + (selectedRow?.input_amount_2 || 0) * input2Price;
  const outputValue = (selectedRow?.output_amount || 0) * outputPrice;
  const profitPerRun = outputValue - inputCost;
  const runsPerHour = selectedRow?.duration_min ? 60 / selectedRow.duration_min : 0;
  const profitPerHour = profitPerRun * runsPerHour;
  const upgradeCost = (selectedRow?.upgrade_amount || 0) * upgradePrice;

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

            {error && <p className="text-sm text-red-300">{error}</p>}

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
                <p>Duration: {formatNumber(selectedRow.duration_min)} min</p>
                <p>Output: {formatNumber(selectedRow.output_amount)} {selectedRow.output_token}</p>
                <p>
                  Input 1: {formatNumber(selectedRow.input_amount_1)} {selectedRow.input_token_1}
                </p>
                <p>
                  Input 2: {selectedRow.input_token_2 ? `${formatNumber(selectedRow.input_amount_2)} ${selectedRow.input_token_2}` : 'N/A'}
                </p>
                <p>
                  Upgrade: {selectedRow.upgrade_token ? `${formatNumber(selectedRow.upgrade_amount)} ${selectedRow.upgrade_token}` : 'N/A'}
                </p>
              </div>
            </Card>

            <Card title="Price Inputs">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>{selectedRow.output_token} price</span>
                  <input
                    type="number"
                    value={outputPrice}
                    onChange={(event) => setOutputPrice(Number(event.target.value) || 0)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                  />
                </label>

                <label className="space-y-1 text-sm">
                  <span>{selectedRow.input_token_1} price</span>
                  <input
                    type="number"
                    value={input1Price}
                    onChange={(event) => setInput1Price(Number(event.target.value) || 0)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                  />
                </label>

                {selectedRow.input_token_2 && (
                  <label className="space-y-1 text-sm">
                    <span>{selectedRow.input_token_2} price</span>
                    <input
                      type="number"
                      value={input2Price}
                      onChange={(event) => setInput2Price(Number(event.target.value) || 0)}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                    />
                  </label>
                )}

                {selectedRow.upgrade_token && (
                  <label className="space-y-1 text-sm">
                    <span>{selectedRow.upgrade_token} price</span>
                    <input
                      type="number"
                      value={upgradePrice}
                      onChange={(event) => setUpgradePrice(Number(event.target.value) || 0)}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                    />
                  </label>
                )}
              </div>
            </Card>

            <Card title="Results">
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <p>Input Cost: {formatNumber(inputCost)}</p>
                <p>Output Value: {formatNumber(outputValue)}</p>
                <p>Profit Per Run: {formatNumber(profitPerRun)}</p>
                <p>Profit Per Hour: {formatNumber(profitPerHour)}</p>
                <p>Runs Per Hour: {formatNumber(runsPerHour)}</p>
                <p>Upgrade Cost: {formatNumber(upgradeCost)}</p>
              </div>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
