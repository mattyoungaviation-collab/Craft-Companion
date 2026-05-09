import { CraftworldHomeData } from '../types.js';
import { getMockCraftworldHomeData } from './mockCraftworldData.js';
import { normalizeCraftworldHomeData } from './normalizeCraftworldHomeData.js';

const query = `query CraftworldCompanionHome { account { id experiencePoints power powerLastRefill skillPoints updatedAt walletAddress resources { symbol amount } lastUserActionAt currencyBalances { type amount } dynos { production { symbol amount } claimableResources { symbol amount } meta { displayName imageUrl rarity isOneOfOne } } landPlots { id name areas { id symbol landPlotId landPlotPosition factories { factory { id level definition { id } } crafting { currentRunLevel startedAt claimedAt unclaimedUnitsBeforeCurrentRun } boosters { startTime endTime boostValue } consumableBoosters { id startTime endTime boostValue } workerBoostIntervals { startTime endTime boostValue } } } booster { startTime endTime boostValue } } vaults { symbol amount capacity isUnlocked buildingUnlockLevel } workshop { symbol level } proficiencies { symbol collectedAmount claimedLevel } profile { uid walletAddress avatarUrl displayName } } }`;

async function requestHomeData(endpoint: string, craftWorldUserId: string, authorizationValue: string) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-version': process.env.CRAFTWORLD_APP_VERSION || '1.10.1',
      Authorization: authorizationValue,
    },
    body: JSON.stringify({ query, variables: { craftWorldUserId } }),
  });

  const raw = await res.json();
  return { res, raw };
}

function getGraphqlError(raw: any) {
  return raw?.errors?.[0]?.message || raw?.message || '';
}

export async function getCraftworldHomeData(craftWorldUserId: string, authToken?: string): Promise<CraftworldHomeData> {
  const token = authToken || process.env.CRAFTWORLD_AUTH_TOKEN;
  const endpoint = process.env.CRAFTWORLD_GRAPHQL_ENDPOINT || 'https://craft-world.gg/graphql';
  if (!token) return getMockCraftworldHomeData();

  const bearerAttempt = await requestHomeData(endpoint, craftWorldUserId, `Bearer ${token}`);
  if (bearerAttempt.res.ok && !bearerAttempt.raw.errors) return normalizeCraftworldHomeData(bearerAttempt.raw);

  const bearerError = getGraphqlError(bearerAttempt.raw);
  const shouldRetryRawToken = bearerError.toLowerCase().includes('unauthenticated');

  if (shouldRetryRawToken) {
    const rawTokenAttempt = await requestHomeData(endpoint, craftWorldUserId, token);
    if (rawTokenAttempt.res.ok && !rawTokenAttempt.raw.errors) return normalizeCraftworldHomeData(rawTokenAttempt.raw);
    throw new Error(getGraphqlError(rawTokenAttempt.raw) || bearerError || 'Unable to load Craft World home data.');
  }

  throw new Error(bearerError || 'Unable to load Craft World home data.');
}
