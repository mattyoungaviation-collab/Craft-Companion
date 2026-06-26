import { CraftworldHomeData, CraftworldProfile, CraftworldWallet, Me } from '../types';

const DEPLOYED_API_BASE_URL = 'https://craft-companion.onrender.com';

function getApiBaseUrl() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');

  if (typeof window !== 'undefined') {
    const { origin, hostname } = window.location;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }

    if (origin === 'https://craft-companion-1hxp.onrender.com') {
      return DEPLOYED_API_BASE_URL;
    }
  }

  return DEPLOYED_API_BASE_URL;
}

const API = getApiBaseUrl();
const token = () => localStorage.getItem('token');

async function req(path: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(init.headers || {}),
    },
  });

  if (!r.ok) {
    let message = 'Request failed';
    try {
      const body = await r.json();
      message = body?.message || message;
    } catch {
      message = `${r.status} ${r.statusText}`;
    }
    throw new Error(message);
  }

  return r.json();
}

export const registerAccount = (body:{craftWorldUserId:string;username:string;password:string}) => req('/api/auth/register',{method:'POST',body:JSON.stringify(body)});
export const login = async(body:{username:string;password:string}) => { const d=await req('/api/auth/login',{method:'POST',body:JSON.stringify(body)}); localStorage.setItem('token', d.token); if (d.user) localStorage.setItem('me', JSON.stringify(d.user)); return d; };
export const craftWorldWalletLogin = async(body:{payload:any;signature:string}) => { const d=await req('/api/auth/craftworld-wallet/login',{method:'POST',body:JSON.stringify(body)}); localStorage.setItem('token', d.token); localStorage.setItem('me', JSON.stringify(d.user)); return d; };
export const createWalletNonce = (body:{address:string}) => req('/api/auth/wallet/nonce',{method:'POST',body:JSON.stringify(body)}) as Promise<{address:string;message:string;expiresAt:string}>;
export const walletLogin = async(body:{address:string;message:string;signature:string}) => { const d=await req('/api/auth/wallet/login',{method:'POST',body:JSON.stringify(body)}); localStorage.setItem('token', d.token); if (d.user) localStorage.setItem('me', JSON.stringify(d.user)); return d; };
export const getMe = () => req('/api/me') as Promise<Me>;
export const updateCraftworldIdentity = (body:{craftWorldUid?:string;walletAddress?:string;primaryWalletAddress?:string}) => req('/api/me/craftworld',{method:'PUT',body:JSON.stringify(body)}) as Promise<Me>;
export const getCraftworldHome = () => req('/api/craftworld/home') as Promise<CraftworldHomeData>;
export const getCraftworldProfile = () => req('/api/craftworld/profile') as Promise<CraftworldProfile>;
export const getCraftworldWallets = () => req('/api/craftworld/wallets') as Promise<{wallets:CraftworldWallet[];primaryWalletAddress?:string;lastSyncedAt:string}>;
export const getCraftworldQuote = (body:{inputSymbol:string;outputSymbol?:string;inputAmount:number}) => req('/api/craftworld/quote',{method:'POST',body:JSON.stringify(body)}) as Promise<{type:string;input:{symbol:string;amount:number};output:{symbol:string;amount:number};details?:{priceImpactPercentage?:number}}>;
export const getCraftworldBuyQuote = (body:{inputSymbol?:string;outputSymbol:string;outputAmount:number}) => req('/api/craftworld/buy-quote',{method:'POST',body:JSON.stringify(body)}) as Promise<{type:string;input:{symbol:string;amount:number};output:{symbol:string;amount:number};details?:{priceImpactPercentage?:number}}>;
export const getCraftworldAuthPayload = (body:{address:string;chainId?:string}) => req('/api/auth/craftworld-wallet/payload',{method:'POST',body:JSON.stringify(body)}) as Promise<{payload:any}>;
export const finishCraftworldAuthLogin = (body:{payload:any;signature:string}) => req('/api/craftworld/auth/login',{method:'POST',body:JSON.stringify(body)}) as Promise<{uid:string;walletAddress:string;expiresAt:string;isNewUser:boolean}>;
export const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('me'); };
