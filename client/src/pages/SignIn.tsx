import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  craftWorldWalletLogin,
  getCraftworldAuthPayload,
  login,
} from '../services/api';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<any>;
    };
    ronin?: {
      provider?: {
        request: (args: { method: string; params?: unknown[] }) => Promise<any>;
      };
    };
  }
}

type CraftWorldPayload = {
  domain: string;
  uri: string;
  statement: string;
  address: string;
  version: string;
  nonce: string;
  issued_at: string;
  expiration_time: string;
  chain_id: string;
};

function getWalletProvider() {
  return window.ronin?.provider || window.ethereum;
}

function formatCraftWorldSignMessage(payload: CraftWorldPayload) {
  return [
    `${payload.domain} wants you to sign in with your Ethereum account:`,
    payload.address,
    '',
    payload.statement,
    '',
    `URI: ${payload.uri}`,
    `Version: ${payload.version}`,
    `Chain ID: ${payload.chain_id}`,
    `Nonce: ${payload.nonce}`,
    `Issued At: ${payload.issued_at}`,
    `Expiration Time: ${payload.expiration_time}`,
  ].join('\n');
}

function findThirdwebSessionToken() {
  const marker = 'embedded-wallet-token:';
  const storages = [window.localStorage, window.sessionStorage];
  for (const storage of storages) {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key) continue;
      const value = storage.getItem(key);
      if (value && value.includes(marker)) return value;
    }
  }
  return undefined;
}

export default function SignIn() {
  const nav = useNavigate();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [e, setE] = useState('');
  const [walletStatus, setWalletStatus] = useState('');

  const signInWithWallet = async () => {
    setE('');
    setWalletStatus('');
    const provider = getWalletProvider();
    if (!provider) {
      setE('Ronin Wallet was not detected. Install Ronin Wallet or open this app in a wallet enabled browser.');
      return;
    }

    try {
      setWalletStatus('Requesting wallet connection...');
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const address = accounts?.[0];
      if (!address) throw new Error('No wallet address was returned.');

      setWalletStatus('Preparing Craft World login payload...');
      const chainIdHex = await provider.request({ method: 'eth_chainId' }).catch(() => null);
      const chainId = chainIdHex ? String(Number(chainIdHex)) : '2020';
      const craftWorldPayload = await getCraftworldAuthPayload({ address, chainId });

      setWalletStatus('Please sign the Craft World login message.');
      const craftWorldMessage = formatCraftWorldSignMessage(craftWorldPayload.payload);
      const craftWorldSignature = await provider.request({ method: 'personal_sign', params: [craftWorldMessage, address] });

      setWalletStatus('Connecting Craft World account...');
      await craftWorldWalletLogin({
        payload: craftWorldPayload.payload,
        signature: craftWorldSignature,
        thirdwebSession: findThirdwebSessionToken(),
      });

      nav('/home');
    } catch (err: any) {
      setWalletStatus('');
      setE(err.message || 'Wallet sign in failed.');
    }
  };

  return (
    <div className="mx-auto mt-12 max-w-md space-y-6">
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h1 className="mb-3 text-xl font-semibold">Sign In</h1>
        <button type="button" onClick={signInWithWallet} className="w-full rounded bg-blue-600 p-2 font-semibold">
          Connect Ronin Wallet
        </button>
        {walletStatus && <p className="mt-2 text-sm text-slate-300">{walletStatus}</p>}
      </div>

      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          try {
            await login({ username, password });
            nav('/home');
          } catch (err: any) {
            setE(err.message);
          }
        }}
        className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4"
      >
        <h2 className="text-sm font-semibold text-slate-300">Or use username and password</h2>
        <input className="w-full rounded border border-slate-700 bg-slate-950 p-2" placeholder="Username" value={username} onChange={(e) => setU(e.target.value)} />
        <input
          type="password"
          className="w-full rounded border border-slate-700 bg-slate-950 p-2"
          placeholder="Password"
          value={password}
          onChange={(e) => setP(e.target.value)}
        />
        <button className="w-full rounded bg-slate-700 p-2">Sign In</button>
      </form>

      {e && <p className="text-red-400">{e}</p>}
    </div>
  );
}
