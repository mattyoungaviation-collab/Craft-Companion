import { CraftworldHomeData, CraftworldProfile, CraftworldWallet, Me } from '../types';
const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const token = () => localStorage.getItem('token');
async function req(path:string, init:RequestInit={}) { const r = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type':'application/json', ...(token()?{Authorization:`Bearer ${token()}`}:{}) } }); if(!r.ok) throw new Error((await r.json()).message||'Request failed'); return r.json(); }
export const registerAccount = (body:{craftWorldUserId:string;username:string;password:string}) => req('/api/auth/register',{method:'POST',body:JSON.stringify(body)});
export const login = async(body:{username:string;password:string}) => { const d=await req('/api/auth/login',{method:'POST',body:JSON.stringify(body)}); localStorage.setItem('token', d.token); return d; };
export const getMe = () => req('/api/me') as Promise<Me>;
export const updateCraftworldIdentity = (body:{craftWorldUid?:string;walletAddress?:string;primaryWalletAddress?:string}) => req('/api/me/craftworld',{method:'PUT',body:JSON.stringify(body)}) as Promise<Me>;
export const getCraftworldHome = () => req('/api/craftworld/home') as Promise<CraftworldHomeData>;
export const getCraftworldProfile = () => req('/api/craftworld/profile') as Promise<CraftworldProfile>;
export const getCraftworldWallets = () => req('/api/craftworld/wallets') as Promise<{wallets:CraftworldWallet[];primaryWalletAddress?:string;lastSyncedAt:string}>;
export const logout = () => localStorage.removeItem('token');
