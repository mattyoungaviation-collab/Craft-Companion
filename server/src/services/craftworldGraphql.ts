import { CraftworldHomeData } from '../types.js';
import { getMockCraftworldHomeData } from './mockCraftworldData.js';
import { normalizeCraftworldHomeData } from './normalizeCraftworldHomeData.js';

const query = `query CraftworldCompanionHome { account { id experiencePoints power powerLastRefill skillPoints updatedAt walletAddress resources { symbol amount } lastUserActionAt currencyBalances { type amount } dynos { production { symbol amount } claimableResources { symbol amount } meta { displayName imageUrl rarity isOneOfOne } } landPlots { id name areas { id symbol landPlotId landPlotPosition factories { factory { id level definition { id } } crafting { currentRunLevel startedAt claimedAt unclaimedUnitsBeforeCurrentRun } boosters { startTime endTime boostValue } consumableBoosters { id startTime endTime boostValue } workerBoostIntervals { startTime endTime boostValue } } } booster { startTime endTime boostValue } } vaults { symbol amount capacity isUnlocked buildingUnlockLevel } workshop { symbol level } proficiencies { symbol collectedAmount claimedLevel } profile { uid walletAddress avatarUrl displayName } } }`;

type CraftworldGraphqlAttempt = {
  res: Response;
  raw: any;
  label: string;
};

function normalizeCraftworldToken(token?: string) {
  const value = String(token || '').trim();
  if (!value) return '';
  if (value.startsWith('jwt_')) return value;
  if (value.split('.').length >= 3) return `jwt_${value}`;
  return value;
}

function browserLikeHeaders(token?: string) {
  const normalizedToken = normalizeCraftworldToken(token);
  return {
    Accept: '*/*',
    Origin: 'https://craft-world.gg',
    Referer: 'https://craft-world.gg/',
    'x-app-version': process.env.CRAFTWORLD_APP_VERSION || '1.11.0',
    ...(normalizedToken ? { Authorization: `Bearer ${normalizedToken}` } : {}),
  };
}

async function requestHomeData(endpoint: string, token: string, label: string): Promise<CraftworldGraphqlAttempt> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...browserLikeHeaders(token),
    },
    body: JSON.stringify({ query }),
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

export async function getCraftworldHomeData(_craftWorldUserId: string, authTokens?: string | string[]): Promise<CraftworldHomeData> {
  const fallbackToken = process.env.CRAFTWORLD_AUTH_TOKEN;
  const tokens = (Array.isArray(authTokens) ? authTokens : [authTokens || fallbackToken]).filter(Boolean) as string[];
  const endpoint = process.env.CRAFTWORLD_GRAPHQL_ENDPOINT || 'https://craft-world.gg/graphql';

  if (!tokens.length) return getMockCraftworldHomeData();

  const attempts: CraftworldGraphqlAttempt[] = [];

  for (const [tokenIndex, token] of tokens.entries()) {
    const attempt = await requestHomeData(endpoint, token, `token-${tokenIndex + 1}:authorization-bearer-jwt`);
    attempts.push(attempt);
    if (attempt.res.ok && !attempt.raw.errors) return normalizeCraftworldHomeData(attempt.raw);
  }

  console.error('Craft World GraphQL home failed', attempts.map(summarizeAttempt));
  const finalError = attempts.map((attempt) => getGraphqlError(attempt.raw)).find(Boolean);
  throw new Error(finalError || 'Unable to load Craft World home data.');
}
