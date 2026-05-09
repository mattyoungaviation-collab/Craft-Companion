import { CraftworldHomeData } from '../types.js';
import { getMockCraftworldHomeData } from './mockCraftworldData.js';
import { normalizeCraftworldHomeData } from './normalizeCraftworldHomeData.js';

const query = `query CraftworldCompanionHome { account { id experiencePoints power powerLastRefill skillPoints updatedAt walletAddress resources { symbol amount } lastUserActionAt currencyBalances { type amount } dynos { production { symbol amount } claimableResources { symbol amount } meta { displayName imageUrl rarity isOneOfOne } } landPlots { id name areas { id symbol landPlotId landPlotPosition factories { factory { id level definition { id } } crafting { currentRunLevel startedAt claimedAt unclaimedUnitsBeforeCurrentRun } boosters { startTime endTime boostValue } consumableBoosters { id startTime endTime boostValue } workerBoostIntervals { startTime endTime boostValue } } } booster { startTime endTime boostValue } } vaults { symbol amount capacity isUnlocked buildingUnlockLevel } workshop { symbol level } proficiencies { symbol collectedAmount claimedLevel } profile { uid walletAddress avatarUrl displayName } } }`;

type CraftworldGraphqlAttempt = {
  res: Response;
  raw: any;
  label: string;
};

type AttemptConfig = {
  label: string;
  headers: Record<string, string>;
};

function browserLikeHeaders() {
  return {
    Accept: '*/*',
    Origin: 'https://craft-world.gg',
    Referer: 'https://craft-world.gg/',
    'x-app-version': process.env.CRAFTWORLD_APP_VERSION || '1.10.1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  };
}

async function requestHomeData(endpoint: string, craftWorldUserId: string, headers: Record<string, string>, label: string): Promise<CraftworldGraphqlAttempt> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...browserLikeHeaders(),
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

function buildAttemptConfigs(token: string, tokenLabel: string): AttemptConfig[] {
  return [
    { label: `${tokenLabel}:authorization-bearer`, headers: { Authorization: `Bearer ${token}` } },
    { label: `${tokenLabel}:authorization-raw`, headers: { Authorization: token } },
    { label: `${tokenLabel}:firebase-auth-bearer`, headers: { FirebaseAuthToken: `Bearer ${token}` } },
    { label: `${tokenLabel}:firebase-auth-raw`, headers: { FirebaseAuthToken: token } },
  ];
}

export async function getCraftworldHomeData(craftWorldUserId: string, authTokens?: string | string[]): Promise<CraftworldHomeData> {
  const fallbackToken = process.env.CRAFTWORLD_AUTH_TOKEN;
  const tokens = (Array.isArray(authTokens) ? authTokens : [authTokens || fallbackToken]).filter(Boolean) as string[];
  const endpoint = process.env.CRAFTWORLD_GRAPHQL_ENDPOINT || 'https://craft-world.gg/graphql';

  const attempts: CraftworldGraphqlAttempt[] = [];

  const noAuthAttempt = await requestHomeData(endpoint, craftWorldUserId, {}, 'browser-like-no-auth');
  attempts.push(noAuthAttempt);
  if (noAuthAttempt.res.ok && !noAuthAttempt.raw.errors) return normalizeCraftworldHomeData(noAuthAttempt.raw);

  if (!tokens.length) return getMockCraftworldHomeData();

  for (const [tokenIndex, token] of tokens.entries()) {
    const attemptConfigs = buildAttemptConfigs(token, `token-${tokenIndex + 1}`);
    for (const config of attemptConfigs) {
      const attempt = await requestHomeData(endpoint, craftWorldUserId, config.headers, config.label);
      attempts.push(attempt);
      if (attempt.res.ok && !attempt.raw.errors) return normalizeCraftworldHomeData(attempt.raw);
    }
  }

  console.error('Craft World GraphQL home failed', attempts.map(summarizeAttempt));
  const finalError = attempts.map((attempt) => getGraphqlError(attempt.raw)).find(Boolean);
  throw new Error(finalError || 'Unable to load Craft World home data.');
}
