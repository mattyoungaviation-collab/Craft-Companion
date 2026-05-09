import { CraftworldAuthPayload } from '../types.js';

const craftWorldBaseUrl = process.env.CRAFTWORLD_BASE_URL || 'https://craft-world.gg';
const firebaseApiKey = process.env.CRAFTWORLD_FIREBASE_API_KEY;

function craftWorldHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    Accept: '*/*',
    Origin: 'https://craft-world.gg',
    Referer: 'https://craft-world.gg/',
    'x-bundle-id': process.env.CRAFTWORLD_BUNDLE_ID || 'com.angrydynomiteslab.craftworld',
    'x-client-id': process.env.CRAFTWORLD_CLIENT_ID || '25bc35076e7821aa8a5779982e2d04b2',
    'x-sdk-name': process.env.CRAFTWORLD_SDK_NAME || 'UnitySDK_WebGL',
    'x-sdk-os': process.env.CRAFTWORLD_SDK_OS || 'WebGLPlayer',
    'x-sdk-platform': process.env.CRAFTWORLD_SDK_PLATFORM || 'unity',
    'x-sdk-version': process.env.CRAFTWORLD_SDK_VERSION || '6.1.1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  };
}

function requireFirebaseApiKey() {
  if (!firebaseApiKey) throw new Error('CRAFTWORLD_FIREBASE_API_KEY is not configured.');
  return firebaseApiKey;
}

function orderAuthPayload(payload: CraftworldAuthPayload): CraftworldAuthPayload {
  return {
    domain: payload.domain,
    address: payload.address,
    statement: payload.statement,
    uri: payload.uri,
    version: payload.version,
    chain_id: payload.chain_id,
    nonce: payload.nonce,
    issued_at: payload.issued_at,
    expiration_time: payload.expiration_time,
  };
}

async function readJson<T>(res: Response): Promise<T> {
  const raw = await res.json();
  if (!res.ok) throw new Error(raw?.message || raw?.error?.message || 'Craft World auth request failed.');
  return raw as T;
}

export async function requestCraftworldAuthPayload(address: string, chainId = '2020'): Promise<CraftworldAuthPayload> {
  const res = await fetch(`${craftWorldBaseUrl}/auth/payload`, {
    method: 'POST',
    headers: craftWorldHeaders(),
    body: JSON.stringify({ address, chainId }),
  });

  const data = await readJson<{ payload: CraftworldAuthPayload }>(res);
  return data.payload;
}

export async function loginCraftworldWithSignedPayload(payload: CraftworldAuthPayload, signature: string): Promise<{ customToken: string; uid: string }> {
  const res = await fetch(`${craftWorldBaseUrl}/auth/login`, {
    method: 'POST',
    headers: craftWorldHeaders(),
    body: JSON.stringify({ payload: { Payload: orderAuthPayload(payload), Signature: signature } }),
  });

  return readJson<{ customToken: string; uid: string }>(res);
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
    headers: { 'Content-Type': 'application/json', Origin: 'https://craft-world.gg' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });

  return readJson<{ idToken: string; refreshToken: string; expiresIn: string; isNewUser: boolean }>(res);
}

export async function lookupCraftworldFirebaseAccount(idToken: string): Promise<{ localId?: string; lastLoginAt?: string; createdAt?: string }> {
  const apiKey = requireFirebaseApiKey();

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://craft-world.gg' },
    body: JSON.stringify({ idToken }),
  });

  const data = await readJson<{ users?: Array<{ localId?: string; lastLoginAt?: string; createdAt?: string }> }>(res);
  return data.users?.[0] || {};
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://craft-world.gg' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });

  const data = await readJson<{ id_token: string; refresh_token: string; expires_in: string; user_id: string }>(res);
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    userId: data.user_id,
  };
}
