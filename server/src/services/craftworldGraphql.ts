import { CraftworldHomeData } from '../types.js';
import { getMockCraftworldHomeData } from './mockCraftworldData.js';
import { normalizeCraftworldHomeData } from './normalizeCraftworldHomeData.js';

const query = `query CraftworldCompanionHome { account { id experiencePoints power powerLastRefill skillPoints updatedAt walletAddress resources { symbol amount } lastUserActionAt currencyBalances { type amount } dynos { production { symbol amount } claimableResources { symbol amount } meta { displayName imageUrl rarity isOneOfOne } } landPlots { id name areas { id symbol landPlotId landPlotPosition factories { factory { id level definition { id } } crafting { currentRunLevel startedAt claimedAt unclaimedUnitsBeforeCurrentRun } boosters { startTime endTime boostValue } consumableBoosters { id startTime endTime boostValue } workerBoostIntervals { startTime endTime boostValue } } } booster { startTime endTime boostValue } } vaults { symbol amount capacity isUnlocked buildingUnlockLevel } workshop { symbol level } proficiencies { symbol collectedAmount claimedLevel } profile { uid walletAddress avatarUrl displayName } } }`;

export async function getCraftworldHomeData(craftWorldUserId: string): Promise<CraftworldHomeData> {
  const token = process.env.CRAFTWORLD_AUTH_TOKEN;
  const endpoint = process.env.CRAFTWORLD_GRAPHQL_ENDPOINT || 'https://craft-world.gg/graphql';
  if (!token) return getMockCraftworldHomeData();
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ query, variables: { craftWorldUserId } }) });
  const raw = await res.json();
  return normalizeCraftworldHomeData(raw);
}
