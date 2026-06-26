import { CraftworldAccountIdentity } from '../types.js';

const craftWorldBaseUrl = process.env.CRAFTWORLD_BASE_URL || 'https://craft-world.gg';
const craftWorldGraphqlUrl = process.env.CRAFTWORLD_GRAPHQL_ENDPOINT || `${craftWorldBaseUrl}/graphql`;
const firebaseApiKey = process.env.CRAFTWORLD_FIREBASE_API_KEY;

function craftWorldHeaders(extra: Record<string, string> = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: '*/*',
    Origin: 'https://craft-world.gg',
    Referer: 'https://craft-world.gg/',
    'x-app-version': process.env.CRAFTWORLD_APP_VERSION || '1.11.0',
    ...extra,
  };
}

function requireFirebaseApiKey() {
  if (!firebaseApiKey) throw new Error('CRAFTWORLD_FIREBASE_API_KEY is not configured.');
  return firebaseApiKey;
}

function normalizeCraftworldToken(token?: string) {
  const value = String(token || '').trim();
  if (!value) return '';
  if (value.startsWith('jwt_')) return value;
  if (value.split('.').length >= 3) return `jwt_${value}`;
  return value;
}

function getResponseErrorMessage(raw: any, fallback: string) {
  return (
    raw?.message ||
    raw?.error?.message ||
    raw?.error_description ||
    raw?.errors?.[0]?.message ||
    fallback
  );
}

async function readJson<T>(res: Response, context = 'Craft World auth request'): Promise<T> {
  const text = await res.text();
  let raw: any;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    const preview = text.slice(0, 240).replace(/\s+/g, ' ');
    throw new Error(`${context} expected JSON from ${res.url}, received: ${preview}`);
  }

  if (!res.ok) {
    const message = getResponseErrorMessage(raw, `${context} failed.`);
    console.error(`${context} failed`, {
      status: res.status,
      statusText: res.statusText,
      url: res.url,
      body: raw,
    });
    throw new Error(`${context} failed: ${message}`);
  }

  return raw as T;
}

async function craftworldGraphql<T>(query: string, variables?: Record<string, unknown>, bearerToken?: string, context = 'Craft World GraphQL'): Promise<T> {
  const token = normalizeCraftworldToken(bearerToken);
  const res = await fetch(craftWorldGraphqlUrl, {
    method: 'POST',
    headers: craftWorldHeaders(token ? { Authorization: `Bearer ${token}` } : {}),
    body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
  });

  const raw = await readJson<any>(res, context);
  if (raw.errors?.length) {
    console.error(`${context} errors`, {
      errors: raw.errors,
      variables,
    });
    throw new Error(`${context} failed: ${raw.errors[0]?.message || 'GraphQL error.'}`);
  }
  return raw.data as T;
}

export async function requestCraftworldAuthPayload(address: string): Promise<{ walletAddress: string; nonce: string }> {
  const query = `
    query($walletAddress: String!) {
      getNonce(walletAddress: $walletAddress) { nonce }
    }
  `;

  const data = await craftworldGraphql<{ getNonce?: { nonce?: string } | string }>(
    query,
    { walletAddress: address },
    undefined,
    'Craft World nonce request',
  );
  const noncePayload = data.getNonce;
  const nonce = typeof noncePayload === 'string' ? noncePayload : noncePayload?.nonce;
  if (!nonce) throw new Error('Craft World nonce was not returned.');
  return { walletAddress: address, nonce };
}

export async function loginCraftworldWithSignedPayload(payload: any, signature: string): Promise<{ customToken: string; uid: string }> {
  const walletAddress = String(payload?.walletAddress || payload?.address || '').trim();
  if (!walletAddress) throw new Error('Wallet address is required for Craft World login.');

  const mutation = `
    mutation LoginForCustomToken($signature: String!, $walletAddress: String!) {
      loginForCustomToken(signature: $signature, walletAddress: $walletAddress) { customToken }
    }
  `;

  const data = await craftworldGraphql<{ loginForCustomToken?: { customToken?: string } | string }>(
    mutation,
    {
      signature,
      walletAddress,
    },
    undefined,
    'Craft World custom token login',
  );
  const tokenPayload = data.loginForCustomToken;
  const customToken = typeof tokenPayload === 'string' ? tokenPayload : tokenPayload?.customToken;
  if (!customToken) throw new Error('Craft World custom token was not returned.');
  return { customToken, uid: '' };
}

export async function exchangeCraftworldCustomToken(customToken: string): Promise<{
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  isNewUser: boolean;
}> {
  const apiKey = requireFirebaseApiKey();

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });

  return readJson<{ idToken: string; refreshToken: string; expiresIn: string; isNewUser: boolean }>(res, 'Firebase custom token exchange');
}

export async function lookupCraftworldFirebaseAccount(idToken: string): Promise<{ localId?: string; lastLoginAt?: string; createdAt?: string }> {
  const apiKey = requireFirebaseApiKey();

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  const data = await readJson<{ users?: Array<{ localId?: string; lastLoginAt?: string; createdAt?: string }> }>(res, 'Firebase account lookup');
  return data.users?.[0] || {};
}

export async function getCraftworldAccountIdentity(idToken?: string, fallbackWalletAddress = ''): Promise<CraftworldAccountIdentity | null> {
  if (!idToken) return null;

  const query = `
    query AccountIdentity {
      account {
        id
        linkedAccounts {
          type
          details {
            id
            user_id
            provider_id
            authProviderId
          }
        }
        wallets {
          address
          type
          provider
          providerId
          primary
        }
      }
    }
  `;

  const data = await craftworldGraphql<{
    account?: {
      id?: string;
      linkedAccounts?: Array<{
        type?: string;
        details?: {
          id?: string;
          user_id?: string;
          provider_id?: string;
          authProviderId?: string;
        };
      }>;
      wallets?: Array<{ address?: string; type?: string; provider?: string | null; providerId?: string | null; primary?: boolean }>;
    };
  }>(query, undefined, idToken, 'Craft World account identity lookup');
  const accountId = String(data.account?.id || '').trim();
  if (!accountId) return null;

  const wallets = Array.isArray(data.account?.wallets) ? data.account?.wallets || [] : [];
  const linkedAccounts = Array.isArray(data.account?.linkedAccounts) ? data.account?.linkedAccounts || [] : [];

  return {
    id: accountId,
    linkedAccounts,
    wallets: wallets.length ? wallets : fallbackWalletAddress ? [{ address: fallbackWalletAddress }] : [],
  };
}

export async function refreshCraftworldIdToken(refreshToken: string): Promise<{
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  userId: string;
}> {
  const apiKey = requireFirebaseApiKey();

  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });

  const data = await readJson<{ id_token: string; refresh_token: string; expires_in: string; user_id: string }>(res, 'Firebase token refresh');
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    userId: data.user_id,
  };
}
