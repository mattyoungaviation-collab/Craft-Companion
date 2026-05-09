import { CraftworldHomeData, FactoryBoost, FactorySummary } from '../types.js';

export function normalizeCraftworldHomeData(raw: any): CraftworldHomeData {
  const account = raw?.data?.account ?? {};
  const factories: FactorySummary[] = [];
  for (const landPlot of account.landPlots ?? []) {
    for (const area of landPlot.areas ?? []) {
      for (const node of area.factories ?? []) {
        const boosts: FactoryBoost[] = [
          ...(node.boosters ?? []).map((b: any) => ({ source: 'factory' as const, startTime: b.startTime, endTime: b.endTime, boostValue: Number(b.boostValue) })),
          ...(node.consumableBoosters ?? []).map((b: any) => ({ source: 'consumable' as const, id: b.id, startTime: b.startTime, endTime: b.endTime, boostValue: Number(b.boostValue) })),
          ...(node.workerBoostIntervals ?? []).map((b: any) => ({ source: 'worker' as const, startTime: b.startTime, endTime: b.endTime, boostValue: Number(b.boostValue) }))
        ];
        if (landPlot.booster) boosts.push({ source: 'landPlot', startTime: landPlot.booster.startTime, endTime: landPlot.booster.endTime, boostValue: Number(landPlot.booster.boostValue) });
        factories.push({ id: node.factory?.id ?? '', definitionId: node.factory?.definition?.id ?? '', landPlotId: landPlot.id ?? area.landPlotId ?? '', landPlotName: landPlot.name, areaId: area.id ?? '', areaSymbol: area.symbol ?? '', landPlotPosition: area.landPlotPosition, level: Number(node.factory?.level ?? 0), currentRunLevel: node.crafting?.currentRunLevel, startedAt: node.crafting?.startedAt, claimedAt: node.crafting?.claimedAt, unclaimedUnitsBeforeCurrentRun: node.crafting?.unclaimedUnitsBeforeCurrentRun, activeBoosts: boosts });
      }
    }
  }
  return { profile: account.profile ?? {}, account: { id: account.id ?? '', experiencePoints: Number(account.experiencePoints ?? 0), power: Number(account.power ?? 0), powerLastRefill: account.powerLastRefill, skillPoints: Number(account.skillPoints ?? 0), updatedAt: account.updatedAt, lastUserActionAt: account.lastUserActionAt, walletAddress: account.walletAddress }, dynos: (account.dynos ?? []).map((d: any) => ({ displayName: d.meta?.displayName ?? 'Unknown Dyno', imageUrl: d.meta?.imageUrl, rarity: d.meta?.rarity, isOneOfOne: d.meta?.isOneOfOne, production: d.production ?? [], claimableResources: d.claimableResources ?? [] })), factories, inventory: account.resources ?? [], vaults: account.vaults ?? [], workshop: account.workshop ?? [], proficiencies: account.proficiencies ?? [], currencies: account.currencyBalances ?? [], lastSyncedAt: new Date().toISOString() };
}
