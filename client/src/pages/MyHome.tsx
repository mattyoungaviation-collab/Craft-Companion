import { useEffect, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { getCraftworldHome, getMe } from '../services/api';

type ResourceAmount = { symbol?: string; amount?: number };
type DynoSummary = { displayName?: string; rarity?: string; isOneOfOne?: boolean };
type FactorySummary = {
  id?: string;
  areaSymbol?: string;
  level?: number;
  landPlotName?: string;
  currentRunLevel?: number;
  activeBoosts?: { boostValue?: number }[];
};
type VaultSummary = { symbol?: string; amount?: number; capacity?: number; isUnlocked?: boolean };
type WorkshopItem = { symbol?: string; level?: number };
type CurrencyBalance = { type?: string; amount?: number };

type HomeData = {
  lastSyncedAt?: string;
  account?: {
    power?: number;
    skillPoints?: number;
    experiencePoints?: number;
    walletAddress?: string;
  };
  dynos?: DynoSummary[];
  factories?: FactorySummary[];
  inventory?: ResourceAmount[];
  vaults?: VaultSummary[];
  workshop?: WorkshopItem[];
  proficiencies?: unknown[];
  currencies?: CurrencyBalance[];
};

function EmptyState({ children }: { children: string }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}

function displayNumber(value: unknown) {
  return typeof value === 'number' ? value.toLocaleString() : 'Not connected';
}

export default function MyHome() {
  const [me, setMe] = useState<any>();
  const [home, setHome] = useState<HomeData>();
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const [meData, homeData] = await Promise.all([getMe(), getCraftworldHome()]);
      setMe(meData);
      setHome(homeData || {});
    } catch (err) {
      setError('Unable to load dashboard data. Please try again.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (!me || !home) return <Layout>Loading...</Layout>;

  const account = home.account || {};
  const dynos = home.dynos || [];
  const factories = home.factories || [];
  const inventory = home.inventory || [];
  const vaults = home.vaults || [];
  const workshop = home.workshop || [];
  const proficiencies = home.proficiencies || [];
  const currencies = home.currencies || [];
  const isCraftWorldConnected = Boolean(
    account.walletAddress || dynos.length || factories.length || inventory.length || vaults.length || workshop.length || currencies.length,
  );
  const lastSynced = home.lastSyncedAt ? new Date(home.lastSyncedAt).toLocaleString() : 'Not connected';

  return (
    <Layout>
      <div className="space-y-4">
        <Card>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p>Welcome back, {me.username}.</p>
              <p>Craft World User ID: {me.craftWorldUserId}</p>
              <p>Last synced: {lastSynced}</p>
            </div>
            <button onClick={load} className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold">
              Refresh Data
            </button>
          </div>
        </Card>

        {error && <Card>{error}</Card>}

        <Card title="Craft World Connection">
          {isCraftWorldConnected ? (
            <p className="text-sm text-emerald-300">Live Craft World data is connected.</p>
          ) : (
            <EmptyState>
              Craft World data is not connected yet. Add CRAFTWORLD_AUTH_TOKEN in the server environment to sync live player data.
            </EmptyState>
          )}
        </Card>

        <div className="grid gap-3 md:grid-cols-4">
          <Card title="Power">{displayNumber(account.power)}</Card>
          <Card title="Skill Points">{displayNumber(account.skillPoints)}</Card>
          <Card title="Experience Points">{displayNumber(account.experiencePoints)}</Card>
          <Card title="Wallet Address">{account.walletAddress || 'Not connected'}</Card>
        </div>

        <Card title="My Dynos">
          {dynos.length ? (
            dynos.map((d, i) => (
              <div key={`${d.displayName || 'dyno'}-${i}`}>
                {d.displayName || 'Unnamed Dyno'} ({d.rarity || 'N/A'}) {d.isOneOfOne ? '• One of One' : ''}
              </div>
            ))
          ) : (
            <EmptyState>No Dynos found yet.</EmptyState>
          )}
        </Card>

        <Card title="My Factories">
          {factories.length ? (
            factories.map((f, i) => (
              <div key={f.id || `factory-${i}`}>
                {f.areaSymbol || 'Unknown'} • L{f.level || 0} • {f.landPlotName || 'Unknown plot'} • Run {f.currentRunLevel || 0} • Boost{' '}
                {f.activeBoosts?.[0]?.boostValue || 0}%
              </div>
            ))
          ) : (
            <EmptyState>No factories found yet.</EmptyState>
          )}
        </Card>

        <Card title="Inventory Snapshot">
          {inventory.length ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {inventory.map((r, i) => (
                <div key={r.symbol || `resource-${i}`}>
                  {r.symbol || 'Unknown'}: {r.amount ?? 0}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>No inventory found yet.</EmptyState>
          )}
        </Card>

        <Card title="Vaults">
          {vaults.length ? (
            vaults.map((v, i) => (
              <div key={v.symbol || `vault-${i}`}>
                {v.symbol || 'Unknown'}: {v.amount ?? 0}/{v.capacity ?? 0} ({v.isUnlocked ? 'Unlocked' : 'Locked'})
              </div>
            ))
          ) : (
            <EmptyState>No vault data found yet.</EmptyState>
          )}
        </Card>

        <Card title="Workshop">
          {workshop.length ? (
            workshop.map((w, i) => (
              <div key={w.symbol || `workshop-${i}`}>
                {w.symbol || 'Unknown'}: Lv {w.level ?? 0}
              </div>
            ))
          ) : (
            <EmptyState>No workshop data found yet.</EmptyState>
          )}
        </Card>

        <Card title="Proficiencies">
          {proficiencies.length ? <div>{proficiencies.length} proficiencies loaded.</div> : <EmptyState>No proficiency data found yet.</EmptyState>}
        </Card>

        <Card title="Currencies">
          {currencies.length ? (
            currencies.map((c, i) => (
              <div key={c.type || `currency-${i}`}>
                {c.type || 'Unknown'}: {c.amount ?? 0}
              </div>
            ))
          ) : (
            <EmptyState>No currencies found yet.</EmptyState>
          )}
        </Card>
      </div>
    </Layout>
  );
}
