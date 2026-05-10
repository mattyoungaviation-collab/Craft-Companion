import { useEffect, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import {
  getCraftworldHome,
  getCraftworldProfile,
  getCraftworldWallets,
  getMe,
  updateCraftworldIdentity,
} from '../services/api';

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
type ProfileData = {
  uid: string;
  walletAddress?: string;
  avatarUrl?: string;
  displayName?: string;
  level?: number;
  badges?: { displayName?: string | null; description?: string | null; url?: string | null }[];
  lastSyncedAt?: string;
};
type WalletData = {
  wallets?: { address: string; type?: string | null; provider?: string | null; providerId?: string | null; primary: boolean }[];
  primaryWalletAddress?: string;
  lastSyncedAt?: string;
};

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

const factoryImages: Record<string, string> = {
  MUD: '/factories/mud.svg',
};

function EmptyState({ children }: { children: string }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}

function displayNumber(value: unknown) {
  return typeof value === 'number' ? value.toLocaleString() : 'Not connected';
}

function ipfsToHttp(url?: string) {
  if (!url) return '';
  return url.startsWith('ipfs://') ? url.replace('ipfs://', 'https://ipfs.io/ipfs/') : url;
}

function getFactoryImage(symbol?: string) {
  if (!symbol) return '';
  return factoryImages[symbol.toUpperCase()] || '';
}

export default function MyHome() {
  const [me, setMe] = useState<any>();
  const [home, setHome] = useState<HomeData>();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [craftWorldUidInput, setCraftWorldUidInput] = useState('');
  const [error, setError] = useState('');
  const [identityMessage, setIdentityMessage] = useState('');

  const load = async () => {
    setError('');
    try {
      const [meData, homeData] = await Promise.all([getMe(), getCraftworldHome()]);
      setMe(meData);
      setHome(homeData || {});
      setCraftWorldUidInput(meData.craftWorldUid || meData.craftWorldUserId || '');

      const uid = meData.craftWorldUid || meData.craftWorldUserId;
      if (uid) {
        try {
          setProfile(await getCraftworldProfile());
        } catch {
          setProfile(null);
        }
      }

      try {
        setWalletData(await getCraftworldWallets());
      } catch {
        setWalletData(null);
      }
    } catch (err) {
      setError('Unable to load dashboard data. Please try again.');
    }
  };

  const saveIdentity = async () => {
    setIdentityMessage('');
    setError('');
    try {
      const updated = await updateCraftworldIdentity({ craftWorldUid: craftWorldUidInput });
      setMe(updated);
      setIdentityMessage('Craft World UID saved.');
      await load();
    } catch {
      setError('Unable to save Craft World UID.');
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
  const wallets = walletData?.wallets || [];
  const isCraftWorldConnected = Boolean(
    account.walletAddress || dynos.length || factories.length || inventory.length || vaults.length || workshop.length || currencies.length,
  );
  const lastSynced = home.lastSyncedAt ? new Date(home.lastSyncedAt).toLocaleString() : 'Not connected';

  const plotDisplayOrder = ['EARTH_PLOT', 'WATER_PLOT', 'FIRE_PLOT', 'BLUEPRINT_PLOT'];
  const factoriesByPlot = factories.reduce<Record<string, FactorySummary[]>>((acc, factory) => {
    const plotKey = factory.landPlotName || 'Unknown plot';
    if (!acc[plotKey]) acc[plotKey] = [];
    acc[plotKey].push(factory);
    return acc;
  }, {});

  const orderedPlots = Object.entries(factoriesByPlot).sort(([plotA], [plotB]) => {
    const indexA = plotDisplayOrder.indexOf(plotA);
    const indexB = plotDisplayOrder.indexOf(plotB);
    const normalizedIndexA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
    const normalizedIndexB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;

    if (normalizedIndexA !== normalizedIndexB) return normalizedIndexA - normalizedIndexB;
    return plotA.localeCompare(plotB);
  });

  return (
    <Layout>
      <div className="space-y-4">
        <Card>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p>Welcome back, {me.username}.</p>
              <p>Craft World UID: {me.craftWorldUid || me.craftWorldUserId || 'Not set'}</p>
              <p>Last synced: {lastSynced}</p>
            </div>
            <button onClick={load} className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold">
              Refresh Data
            </button>
          </div>
        </Card>

        {error && <Card>{error}</Card>}

        <Card title="Connect Craft World Identity">
          <div className="space-y-3">
            <p className="text-sm text-slate-300">Save your Craft World UID so this app can load your public profile and prepare account specific tools.</p>
            <div className="flex flex-col gap-2 md:flex-row">
              <input
                value={craftWorldUidInput}
                onChange={(event) => setCraftWorldUidInput(event.target.value)}
                placeholder="Craft World UID"
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
              <button onClick={saveIdentity} className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold">
                Save UID
              </button>
            </div>
            {identityMessage && <p className="text-sm text-emerald-300">{identityMessage}</p>}
          </div>
        </Card>

        {profile && (
          <Card title="Craft World Profile">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              {profile.avatarUrl && <img src={ipfsToHttp(profile.avatarUrl)} alt="Craft World avatar" className="h-20 w-20 rounded-xl object-cover" />}
              <div className="space-y-1">
                <p className="text-lg font-semibold">{profile.displayName || 'Unnamed player'}</p>
                <p className="text-sm text-slate-300">Level {profile.level ?? 'N/A'}</p>
                <p className="break-all text-sm text-slate-400">Profile Wallet: {profile.walletAddress || 'Not available'}</p>
                <p className="text-sm text-slate-400">Badges: {profile.badges?.length || 0}</p>
              </div>
            </div>
          </Card>
        )}

        <Card title="Craft World Wallets">
          {wallets.length ? (
            <div className="space-y-2">
              {wallets.map((wallet) => (
                <div key={wallet.address} className={`rounded-lg border p-3 text-sm ${wallet.primary ? 'border-emerald-400/80 bg-emerald-500/10' : 'border-slate-700'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="break-all font-semibold">{wallet.address}</div>
                    {wallet.primary && (
                      <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-950">Primary</span>
                    )}
                  </div>
                  <div className="mt-1 text-slate-400">Type: {wallet.type || 'Unknown type'}</div>
                  <div className="text-slate-400">Provider: {wallet.provider || 'No provider'}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>
              {isCraftWorldConnected
                ? 'No authenticated Craft World wallets are available for this account yet.'
                : 'Connect live Craft World data to load authenticated wallet details.'}
            </EmptyState>
          )}
        </Card>

        <Card title="Craft World Connection">
          {isCraftWorldConnected ? (
            <p className="text-sm text-emerald-300">Live Craft World data is connected.</p>
          ) : (
            <EmptyState>
              Craft World account data is not connected yet. Add CRAFTWORLD_AUTH_TOKEN in the server environment to sync live player data.
            </EmptyState>
          )}
        </Card>

        <div className="grid gap-3 md:grid-cols-4">
          <Card title="Power">{displayNumber(account.power)}</Card>
          <Card title="Skill Points">{displayNumber(account.skillPoints)}</Card>
          <Card title="Experience Points">{displayNumber(account.experiencePoints)}</Card>
          <Card title="Primary Wallet">{account.walletAddress || 'Not connected'}</Card>
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
          {orderedPlots.length ? (
            <div className="space-y-4">
              {orderedPlots.map(([plotName, plotFactories]) => {
                const sortedFactories = [...plotFactories].sort((a, b) => {
                  const symbolSort = (a.areaSymbol || '').localeCompare(b.areaSymbol || '');
                  if (symbolSort !== 0) return symbolSort;
                  const aDisplayLevel = (a.level ?? -1) + 1;
                  const bDisplayLevel = (b.level ?? -1) + 1;
                  return bDisplayLevel - aDisplayLevel;
                });

                const highestDisplayedLevel = sortedFactories.reduce((maxLevel, factory) => {
                  const displayLevel = (factory.level ?? -1) + 1;
                  return displayLevel > maxLevel ? displayLevel : maxLevel;
                }, 0);

                const activeBoostValues = sortedFactories
                  .flatMap((factory) => factory.activeBoosts || [])
                  .map((boost) => boost.boostValue || 0)
                  .filter((value) => value > 0);

                return (
                  <div key={plotName} className="space-y-2">
                    <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
                      <p className="text-sm font-semibold">{plotName}</p>
                      <p className="text-xs text-slate-400">
                        {sortedFactories.length} factories • Highest Lv {highestDisplayedLevel} •{' '}
                        {activeBoostValues.length
                          ? `Active boosts: ${activeBoostValues.map((value) => `${value}%`).join(', ')}`
                          : 'No active boost'}
                      </p>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {sortedFactories.map((factory, index) => {
                        const displayLevel = (factory.level ?? 0) + 1;
                        const craftDisplayLevel =
                          typeof factory.currentRunLevel === 'number' ? factory.currentRunLevel + 1 : null;
                        const boostValue = factory.activeBoosts?.[0]?.boostValue || 0;
                        const symbol = factory.areaSymbol || 'Unknown';
                        const factoryImage = getFactoryImage(symbol);

                        return (
                          <div key={factory.id || `${plotName}-factory-${index}`} className="flex items-center gap-3 rounded border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm">
                            {factoryImage ? (
                              <img src={factoryImage} alt={`${symbol} factory`} className="h-14 w-14 shrink-0 rounded-lg border border-slate-700 bg-slate-900 object-contain p-1" />
                            ) : (
                              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-xs font-bold text-slate-500">
                                {symbol.slice(0, 3)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold">{symbol}</p>
                              <p className="text-slate-300">
                                Lv {displayLevel}
                                {craftDisplayLevel !== null ? ` • Craft Lv ${craftDisplayLevel}` : ''}
                              </p>
                              {boostValue > 0 ? <p className="text-slate-400">Boost {boostValue}%</p> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
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
