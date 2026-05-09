import { CraftworldProfile, CraftworldWallet } from '../types.js';

const endpoint = () => process.env.CRAFTWORLD_GRAPHQL_ENDPOINT || 'https://craft-world.gg/graphql';

const profileByUidQuery = `
  query ProfileByUID($uid: ID!) {
    profileByUID(uid: $uid) {
      uid
      walletAddress
      avatarUrl
      displayName
      level
      badges {
        url
        description
        displayName
        infoUrl
      }
    }
  }
`;

const walletsQuery = `
  query GetWallets {
    account {
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

async function graphqlRequest<T>(query: string, variables: Record<string, unknown> | null = null, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-app-version': process.env.CRAFTWORLD_APP_VERSION || '1.10.1',
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(endpoint(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const raw = await res.json();
  if (!res.ok || raw.errors) throw new Error(raw.errors?.[0]?.message || 'Craft World request failed.');
  return raw.data as T;
}

export async function getCraftworldProfileByUid(uid: string): Promise<CraftworldProfile> {
  const data = await graphqlRequest<{ profileByUID: Omit<CraftworldProfile, 'lastSyncedAt'> | null }>(profileByUidQuery, { uid });
  if (!data.profileByUID) throw new Error('Craft World profile not found.');
  return {
    ...data.profileByUID,
    badges: data.profileByUID.badges || [],
    lastSyncedAt: new Date().toISOString(),
  };
}

export async function getCraftworldWallets(): Promise<{ wallets: CraftworldWallet[]; primaryWalletAddress?: string; lastSyncedAt: string }> {
  const token = process.env.CRAFTWORLD_AUTH_TOKEN;
  if (!token) return { wallets: [], lastSyncedAt: new Date().toISOString() };

  const data = await graphqlRequest<{ account?: { wallets?: CraftworldWallet[] } }>(walletsQuery, null, token);
  const wallets = data.account?.wallets || [];
  return {
    wallets,
    primaryWalletAddress: wallets.find((wallet) => wallet.primary)?.address,
    lastSyncedAt: new Date().toISOString(),
  };
}
