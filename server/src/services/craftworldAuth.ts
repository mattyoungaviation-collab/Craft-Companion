import { CraftworldAuthPayload } from '../types.js';

const craftWorldBaseUrl = process.env.CRAFTWORLD_BASE_URL || 'https://craft-world.gg';
const firebaseApiKey = process.env.CRAFTWORLD_FIREBASE_API_KEY;

function craftWorldHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'x-bundle-id': process.env.CRAFTWORLD_BUNDLE_ID || 'com.angrydynomiteslab.craftworld',
    'x-client-id': process.env.CRAFTWORLD_CLIENT_ID || '25bc35076e7821aa8a5779982e2d04b2',
    'x-sdk-name': process.env.CRAFTWORLD_SDK_NAME || 'UnitySDK_WebGL',
    'x-sdk-os': process.env.CRAFTWORLD_SDK_OS || 'WebGLPlayer',
    'x-sdk-platform': process.env.CRAFTWORLD_SDK_PLATFORM || 'unity',
    'x-sdk-version': process.env.CRAFTWORLD_SDK_VERSION || '6.1.1',
  };
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
  if (!firebaseApiKey) throw new Error('CRAFTWORLD_FIREBASE_API_KEY is not configured.');

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });

  return readJson<{ idToken: string; refreshToken: string; expiresIn: string; isNewUser: boolean }>(res);
}
