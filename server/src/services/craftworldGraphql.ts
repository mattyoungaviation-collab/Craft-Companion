import { CraftworldHomeData, ProficiencyItem, WorkshopItem } from '../types.js';
import { getMockCraftworldHomeData } from './mockCraftworldData.js';
import { normalizeCraftworldHomeData } from './normalizeCraftworldHomeData.js';

const query = `query CraftworldCompanionHome { account { id experiencePoints power powerLastRefill skillPoints updatedAt walletAddress resources { symbol amount } lastUserActionAt currencyBalances { type amount } dynos { production { symbol amount } claimableResources { symbol amount } meta { displayName imageUrl rarity isOneOfOne } } landPlots { id name areas { id symbol landPlotId landPlotPosition factories { factory { id level definition { id } } crafting { currentRunLevel startedAt claimedAt unclaimedUnitsBeforeCurrentRun } boosters { startTime endTime boostValue } consumableBoosters { id startTime endTime boostValue } workerBoostIntervals { startTime endTime boostValue } } } booster { startTime endTime boostValue } } vaults { symbol amount capacity isUnlocked buildingUnlockLevel } workshop { symbol level } proficiencies { symbol collectedAmount claimedLevel } profile { uid walletAddress avatarUrl displayName } } }`;

const publicCraftworldQuery = `query FetchCraftWorld($uid: ID!) { fetchCraftWorld(uid: $uid) { landPlots { areas { symbol factories { factory { level definition { id } } } } } mines { level definition { id } } dynos { meta { displayName rarity } production { amount symbol } } resources { symbol amount } } }`;

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

async function postGraphql(endpoint: string, body: any, token: string, label: string): Promise<CraftworldGraphqlAttempt> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...browserLikeHeaders(token),
    },
    body: JSON.stringify(body),
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

async function requestHomeData(endpoint: string, token: string, label: string): Promise<CraftworldGraphqlAttempt> {
  return postGraphql(endpoint, { query }, token, label);
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

function normalizeManualWorkshop(items?: WorkshopItem[]) {
  return (items || [])
    .map((item) => ({ symbol: String(item.symbol || '').trim().toUpperCase(), level: Number(item.level || 0) }))
    .filter((item) => item.symbol && Number.isFinite(item.level));
}

function normalizeManualProficiencies(items?: ProficiencyItem[]) {
  return (items || [])
    .map((item) => ({
      symbol: String(item.symbol || '').trim().toUpperCase(),
      collectedAmount: Number(item.collectedAmount || 0),
      claimedLevel: Number(item.claimedLevel || 0),
    }))
    .filter((item) => item.symbol && Number.isFinite(item.claimedLevel));
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
    if (attempt.res.ok && !attempt.raw.errors) {
      const normalized = normalizeCraftworldHomeData(attempt.raw);
      normalized.source = 'authenticated';
      return normalized;
    }
  }

  console.error('Craft World GraphQL home failed', attempts.map(summarizeAttempt));
  const finalError = attempts.map((attempt) => getGraphqlError(attempt.raw)).find(Boolean);
  throw new Error(finalError || 'Unable to load Craft World home data.');
}

export async function getPublicCraftworldHomeData(
  uid: string,
  manualWorkshop?: WorkshopItem[],
  manualProficiencies?: ProficiencyItem[],
): Promise<CraftworldHomeData> {
  const token = process.env.CRAFTWORLD_AUTH_TOKEN;
  const endpoint = process.env.CRAFTWORLD_GRAPHQL_ENDPOINT || 'https://craft-world.gg/graphql';
  const trimmedUid = String(uid || '').trim();

  if (!trimmedUid) return getMockCraftworldHomeData();
  if (!token) throw new Error('CRAFTWORLD_AUTH_TOKEN is required for public UID Craft World sync.');

  const attempt = await postGraphql(
    endpoint,
    { query: publicCraftworldQuery, variables: { uid: trimmedUid } },
    token,
    'public-fetchCraftWorld-by-uid',
  );

  if (!attempt.res.ok || attempt.raw.errors) {
    throw new Error(getGraphqlError(attempt.raw) || 'Unable to load public Craft World data.');
  }

  const data = attempt.raw?.data?.fetchCraftWorld || {};
  const factories = [] as CraftworldHomeData['factories'];

  for (const [plotIndex, landPlot] of (data.landPlots || []).entries()) {
    const plotName = `PLOT_${plotIndex + 1}`;
    for (const [areaIndex, area] of (landPlot.areas || []).entries()) {
      for (const [factoryIndex, node] of (area.factories || []).entries()) {
        if (!node?.factory) continue;
        const definitionId = String(node.factory.definition?.id || area.symbol || '').toUpperCase();
        factories.push({
          id: `${plotName}-${definitionId}-${areaIndex}-${factoryIndex}`,
          definitionId,
          landPlotId: plotName,
          landPlotName: plotName,
          areaId: `${plotName}-${area.symbol || 'AREA'}-${areaIndex}`,
          areaSymbol: String(area.symbol || definitionId || '').toUpperCase(),
          landPlotPosition: areaIndex,
          level: Number(node.factory.level || 0),
          currentRunLevel: Number(node.factory.level || 0),
          activeBoosts: [],
        });
      }
    }
  }

  return {
    profile: { uid: trimmedUid },
    account: {
      id: trimmedUid,
      experiencePoints: 0,
      power: 0,
      skillPoints: 0,
    },
    dynos: (data.dynos || []).map((dyno: any) => ({
      displayName: dyno.meta?.displayName || 'Unknown Dyno',
      rarity: dyno.meta?.rarity,
      production: dyno.production ? [dyno.production] : [],
      claimableResources: [],
    })),
    factories,
    inventory: data.resources || [],
    vaults: [],
    workshop: normalizeManualWorkshop(manualWorkshop),
    proficiencies: normalizeManualProficiencies(manualProficiencies),
    currencies: [],
    lastSyncedAt: new Date().toISOString(),
    source: 'public-uid',
  };
}
