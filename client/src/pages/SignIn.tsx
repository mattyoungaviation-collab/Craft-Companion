import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EthereumProvider from '@walletconnect/ethereum-provider';
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

type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
  disconnect?: () => Promise<void>;
};

const RONIN_CHAIN_ID = 2020;
const RONIN_RPC_URL = 'https://api.roninchain.com/rpc';

function getInjectedWalletProvider() {
  return window.ronin?.provider || window.ethereum;
}

async function getWalletConnectProvider() {
  const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
  if (!projectId) {
    throw new Error('WalletConnect is not configured. Add VITE_WALLETCONNECT_PROJECT_ID to your environment.');
  }

  const provider = await EthereumProvider.init({
    projectId,
    chains: [RONIN_CHAIN_ID],
    optionalChains: [RONIN_CHAIN_ID],
    rpcMap: {
      [RONIN_CHAIN_ID]: RONIN_RPC_URL,
    },
    showQrModal: true,
    metadata: {
      name: 'Craft World Companion',
      description: 'Official Craft World account authentication',
      url: 'https://craft-world.gg',
      icons: ['https://craft-world.gg/favicon.ico'],
    },
  });

  await provider.connect();
  return provider as WalletProvider;
}

export default function SignIn() {
  const nav = useNavigate();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [e, setE] = useState('');
  const [walletStatus, setWalletStatus] = useState('');

  const completeCraftWorldWalletLogin = async (provider: WalletProvider, label: string) => {
    setE('');
    setWalletStatus(`Requesting ${label} connection...`);

    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    const address = accounts?.[0];

    if (!address) {
      throw new Error('No wallet address was returned.');
    }

    setWalletStatus('Requesting official Craft World authentication payload...');

    const craftWorldPayload = await getCraftworldAuthPayload({ address });

    setWalletStatus('Please sign the official Craft World login message.');

    const craftWorldSignature = await provider.request({
      method: 'personal_sign',
      params: [craftWorldPayload.payload.message, address],
    });

    setWalletStatus('Authenticating with Craft World...');

    await craftWorldWalletLogin({
      payload: craftWorldPayload.payload,
      signature: craftWorldSignature,
    });

    nav('/home');
  };

  const signInWithRoninWallet = async () => {
    setE('');
    setWalletStatus('');

    const provider = getInjectedWalletProvider();

    if (!provider) {
      setE('Ronin Wallet was not detected. Install Ronin Wallet or open this app in a wallet enabled browser.');
      return;
    }

    try {
      await completeCraftWorldWalletLogin(provider, 'Ronin Wallet');
    } catch (err: any) {
      setWalletStatus('');
      setE(err.message || 'Ronin Wallet sign in failed.');
    }
  };

  const signInWithWalletConnect = async () => {
    setE('');
    setWalletStatus('');

    try {
      const provider = await getWalletConnectProvider();
      await completeCraftWorldWalletLogin(provider, 'WalletConnect');
    } catch (err: any) {
      setWalletStatus('');
      setE(err.message || 'WalletConnect sign in failed.');
    }
  };

  return (
    <div className="mx-auto mt-12 max-w-md space-y-6">
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h1 className="mb-3 text-xl font-semibold">Sign In</h1>

        <div className="space-y-3">
          <button
            type="button"
            onClick={signInWithRoninWallet}
            className="w-full rounded bg-blue-600 p-2 font-semibold"
          >
            Connect Ronin Wallet
          </button>

          <button
            type="button"
            onClick={signInWithWalletConnect}
            className="w-full rounded bg-slate-700 p-2 font-semibold"
          >
            Connect with WalletConnect
          </button>
        </div>

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
        <h2 className="text-sm font-semibold text-slate-300">
          Or use username and password
        </h2>

        <input
          className="w-full rounded border border-slate-700 bg-slate-950 p-2"
          placeholder="Username"
          value={username}
          onChange={(e) => setU(e.target.value)}
        />

        <input
          type="password"
          className="w-full rounded border border-slate-700 bg-slate-950 p-2"
          placeholder="Password"
          value={password}
          onChange={(e) => setP(e.target.value)}
        />

        <button className="w-full rounded bg-slate-700 p-2">
          Sign In
        </button>
      </form>

      {e && <p className="text-red-400">{e}</p>}
    </div>
  );
}
