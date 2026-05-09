import { CraftworldHomeData } from '../types.js';
import { getMockCraftworldHomeData } from './mockCraftworldData.js';
import { normalizeCraftworldHomeData } from './normalizeCraftworldHomeData.js';

const query = `query CraftworldCompanionHome { account { id experiencePoints power powerLastRefill skillPoints updatedAt walletAddress resources { symbol amount } lastUserActionAt currencyBalances { type amount } dynos { production { symbol amount } claimableResources { symbol amount } meta { displayName imageUrl rarity isOneOfOne } } landPlots { id name areas { id symbol landPlotId landPlotPosition factories { factory { id level definition { id } } crafting { currentRunLevel startedAt claimedAt unclaimedUnitsBeforeCurrentRun } boosters { startTime endTime boostValue } consumableBoosters { id startTime endTime boostValue } workerBoostIntervals { startTime endTime boostValue } } } booster { startTime endTime boostValue } } vaults { symbol amount capacity isUnlocked buildingUnlockLevel } workshop { symbol level } proficiencies { symbol collectedAmount claimedLevel } profile { uid walletAddress avatarUrl displayName } } }`;

type CraftworldGraphqlAttempt = {
  res: Response;
  raw: any;
  label: string;
};

async function requestHomeData(endpoint: string, craftWorldUserId: string, headers: Record<string, string>, label: string): Promise<CraftworldGraphqlAttempt> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-version': process.env.CRAFTWORLD_APP_VERSION || '1.10.1',
      ...headers,
    },
    body: JSON.stringify({ query, variables: { craftWorldUserId } }),
  });

  const text = await res.text();
  let raw: any;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    raw = { message: text || 'Non JSON response from Craft World.' };
  }

  return { res, raw, label };
}

function getGraphqlError(raw: any) {
  return raw?.errors?.[0]?.message || raw?.message || '';
}

function summarizeAttempt(attempt: CraftworldGraphqlAttempt) {
  return {
    label: attempt.label,
    status: attempt.res.status,
    ok: attempt.res.ok,
    error: getGraphqlError(attempt.raw),
  };
}

export async function getCraftworldHomeData(craftWorldUserId: string, authToken?: string): Promise<CraftworldHomeData> {
  const token = authToken || process.env.CRAFTWORLD_AUTH_TOKEN;
  const endpoint = process.env.CRAFTWORLD_GRAPHQL_ENDPOINT || 'https://craft-world.gg/graphql';
  if (!token) return getMockCraftworldHomeData();

  const attempts: CraftworldGraphqlAttempt[] = [];
  const attemptConfigs = [
    { label: 'authorization-bearer', headers: { Authorization: `Bearer ${token}` } },
    { label: 'authorization-raw', headers: { Authorization: token } },
    { label: 'firebase-auth-bearer', headers: { FirebaseAuthToken: `Bearer ${token}` } },
    { label: 'firebase-auth-raw', headers: { FirebaseAuthToken: token } },
  ];

  for (const config of attemptConfigs) {
    const attempt = await requestHomeData(endpoint, craftWorldUserId, config.headers, config.label);
    attempts.push(attempt);
    if (attempt.res.ok && !attempt.raw.errors) return normalizeCraftworldHomeData(attempt.raw);
  }

  console.error('Craft World GraphQL home failed', attempts.map(summarizeAttempt));
  const finalError = attempts.map((attempt) => getGraphqlError(attempt.raw)).find(Boolean);
  throw new Error(finalError || 'Unable to load Craft World home data.');
}
