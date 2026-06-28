import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { loadFactoryData } from '../services/factoryData';
import {
  exportPlayerConfig,
  getFactoryConfig,
  importPlayerConfig,
  loadPlayerConfig,
  resetPlayerConfig,
  savePlayerConfig,
  type PlayerConfig,
} from '../services/playerConfig';

export default function Settings() {
  const [tokens, setTokens] = useState<string[]>([]);
  const [selectedToken, setSelectedToken] = useState('');
  const [config, setConfig] = useState<PlayerConfig>(() => loadPlayerConfig());
  const [json, setJson] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadFactoryData().then((rows) => {
      const nextTokens = Array.from(new Set(rows.map((row) => row.token).filter(Boolean))).sort();
      setTokens(nextTokens);
      setSelectedToken((current) => current || nextTokens[0] || '');
    });
  }, []);

  const selected = useMemo(() => getFactoryConfig(config, selectedToken), [config, selectedToken]);

  function updateSelected(next: Partial<typeof selected>) {
    const updated = savePlayerConfig({
      ...config,
      factories: {
        ...config.factories,
        [selectedToken]: { ...selected, ...next },
      },
    });
    setConfig(updated);
    setStatus('Saved locally.');
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card title="Settings">
          <div className="space-y-3 text-sm">
            <p className="text-slate-300">Saved player setup is stored locally in this browser and survives refreshes.</p>
            {status && <p className="text-emerald-300">{status}</p>}
            <label className="block space-y-1">
              <span>Factory / Resource</span>
              <select value={selectedToken} onChange={(event) => setSelectedToken(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2">
                {tokens.map((token) => <option key={token} value={token}>{token}</option>)}
              </select>
            </label>
          </div>
        </Card>

        {selectedToken && (
          <Card title={`${selectedToken} Local Setup`}>
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={selected.enabled} onChange={(event) => updateSelected({ enabled: event.target.checked })} />
                Owned / enabled
              </label>
              <label className="space-y-1">
                <span>Factory count</span>
                <input type="number" min="1" value={selected.factoryCount} onChange={(event) => updateSelected({ factoryCount: Number(event.target.value) })} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" />
              </label>
              <label className="space-y-1">
                <span>Factory level</span>
                <input type="number" min="1" value={selected.factoryLevel} onChange={(event) => updateSelected({ factoryLevel: Number(event.target.value) })} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" />
              </label>
              <label className="space-y-1">
                <span>Workers %</span>
                <input type="number" min="0" value={selected.workersPercent} onChange={(event) => updateSelected({ workersPercent: Number(event.target.value) })} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" />
              </label>
              <label className="space-y-1">
                <span>Workshop %</span>
                <input type="number" min="0" value={selected.workshopPercent} onChange={(event) => updateSelected({ workshopPercent: Number(event.target.value) })} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" />
              </label>
              <label className="space-y-1">
                <span>Boost multiplier</span>
                <select value={selected.boostMultiplier} onChange={(event) => updateSelected({ boostMultiplier: Number(event.target.value) })} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2">
                  {[1, 2, 5, 10].map((value) => <option key={value} value={value}>{value}x</option>)}
                </select>
              </label>
              <label className="space-y-1 md:col-span-3">
                <span>Notes</span>
                <textarea value={selected.notes} onChange={(event) => updateSelected({ notes: event.target.value })} className="min-h-24 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" />
              </label>
            </div>
          </Card>
        )}

        <Card title="Import / Export">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setJson(exportPlayerConfig(config))} className="rounded bg-blue-600 px-3 py-2 font-semibold">Export JSON</button>
              <button
                onClick={() => {
                  try {
                    const imported = importPlayerConfig(json);
                    setConfig(imported);
                    setStatus('Imported local config.');
                  } catch {
                    setStatus('Import failed: malformed JSON.');
                  }
                }}
                className="rounded bg-slate-700 px-3 py-2 font-semibold"
              >
                Import JSON
              </button>
              <button
                onClick={() => {
                  setConfig(resetPlayerConfig());
                  setJson('');
                  setStatus('Local config reset.');
                }}
                className="rounded bg-red-700 px-3 py-2 font-semibold"
              >
                Reset All
              </button>
            </div>
            <textarea value={json} onChange={(event) => setJson(event.target.value)} className="min-h-48 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs" />
          </div>
        </Card>
      </div>
    </Layout>
  );
}
