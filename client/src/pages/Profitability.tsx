import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { loadFactoryData, type FactoryDataRow } from '../services/factoryData';

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0';
}

export default function Profitability() {
  const [rows, setRows] = useState<FactoryDataRow[]>([]);
  const [selectedToken, setSelectedToken] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<number>(0);
  const [outputPrice, setOutputPrice] = useState(0);
  const [input1Price, setInput1Price] = useState(0);
  const [input2Price, setInput2Price] = useState(0);
  const [upgradePrice, setUpgradePrice] = useState(0);

  useEffect(() => {
    const load = async () => {
      const data = await loadFactoryData();
      setRows(data);
      if (data.length) {
        const firstToken = [...new Set(data.map((row) => row.token))].sort()[0];
        setSelectedToken(firstToken);
      }
    };
    load();
  }, []);

  const tokenOptions = useMemo(() => [...new Set(rows.map((row) => row.token))].sort(), [rows]);

  const levelsForToken = useMemo(
    () => rows.filter((row) => row.token === selectedToken).sort((a, b) => a.level - b.level),
    [rows, selectedToken],
  );

  useEffect(() => {
    if (!levelsForToken.length) {
      setSelectedLevel(0);
      return;
    }

    const hasSelected = levelsForToken.some((row) => row.level === selectedLevel);
    if (!hasSelected) {
      setSelectedLevel(levelsForToken[0].level);
    }
  }, [levelsForToken, selectedLevel]);

  const selectedRow = useMemo(
    () => levelsForToken.find((row) => row.level === selectedLevel) || null,
    [levelsForToken, selectedLevel],
  );

  const inputCost = (selectedRow?.input_amount_1 || 0) * input1Price + (selectedRow?.input_amount_2 || 0) * input2Price;
  const outputValue = (selectedRow?.output_amount || 0) * outputPrice;
  const profitPerRun = outputValue - inputCost;
  const runsPerHour = selectedRow?.duration_min ? 60 / selectedRow.duration_min : 0;
  const profitPerHour = profitPerRun * runsPerHour;
  const upgradeCost = (selectedRow?.upgrade_amount || 0) * upgradePrice;

  return (
    <Layout>
      <div className="space-y-4">
        <Card title="Profitability Calculator">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Factory / Resource</span>
              <select
                value={selectedToken}
                onChange={(event) => setSelectedToken(event.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              >
                {tokenOptions.map((token) => (
                  <option key={token} value={token}>
                    {token}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span>Level</span>
              <select
                value={selectedLevel}
                onChange={(event) => setSelectedLevel(Number(event.target.value))}
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
              >
                {levelsForToken.map((row) => (
                  <option key={`${row.token}-${row.level}`} value={row.level}>
                    {row.level}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Card>

        {selectedRow && (
          <>
            <Card title="Selected Factory Row">
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <p>token: {selectedRow.token}</p>
                <p>level: {selectedRow.level}</p>
                <p>duration_min: {selectedRow.duration_min}</p>
                <p>output_token: {selectedRow.output_token}</p>
                <p>output_amount: {selectedRow.output_amount}</p>
                <p>input_token_1: {selectedRow.input_token_1}</p>
                <p>input_amount_1: {selectedRow.input_amount_1}</p>
                <p>input_token_2: {selectedRow.input_token_2 || 'N/A'}</p>
                <p>input_amount_2: {selectedRow.input_amount_2}</p>
                <p>upgrade_token: {selectedRow.upgrade_token || 'N/A'}</p>
                <p>upgrade_amount: {selectedRow.upgrade_amount}</p>
              </div>
            </Card>

            <Card title="Price Inputs">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>{selectedRow.output_token} price</span>
                  <input type="number" value={outputPrice} onChange={(event) => setOutputPrice(Number(event.target.value) || 0)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" />
                </label>

                <label className="space-y-1 text-sm">
                  <span>{selectedRow.input_token_1} price</span>
                  <input type="number" value={input1Price} onChange={(event) => setInput1Price(Number(event.target.value) || 0)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" />
                </label>

                {selectedRow.input_token_2 && (
                  <label className="space-y-1 text-sm">
                    <span>{selectedRow.input_token_2} price</span>
                    <input type="number" value={input2Price} onChange={(event) => setInput2Price(Number(event.target.value) || 0)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" />
                  </label>
                )}

                {selectedRow.upgrade_token && (
                  <label className="space-y-1 text-sm">
                    <span>{selectedRow.upgrade_token} price</span>
                    <input type="number" value={upgradePrice} onChange={(event) => setUpgradePrice(Number(event.target.value) || 0)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" />
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
                <p>Duration: {formatNumber(selectedRow.duration_min)} min</p>
                <p>Upgrade Cost: {formatNumber(upgradeCost)}</p>
              </div>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
