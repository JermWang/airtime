"use client";

import { createConfig, createConnector, http, type Config } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { createPublicClient, createWalletClient, http as viemHttp, numberToHex, hexToBigInt, type Chain, type Hex, type EIP1193Parameters, type EIP1193RequestFn } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain, activeChainEnv } from "./chain/chains";

/**
 * wagmi configuration.
 *
 * Connectors:
 *   - injected (MetaMask, Rabby, Robinhood Wallet extension, …)
 *   - WalletConnect (Robinhood Wallet mobile and any WC-compatible wallet) when a project id exists
 *   - AIRTIME dev wallet: a local anvil account, only when NEXT_PUBLIC_DEV_WALLET_PRIVATE_KEY is set
 *     (development & E2E). It signs locally and talks to the local RPC directly.
 */

export function browserRpcUrl(chain: Chain): string {
  return process.env.NEXT_PUBLIC_RPC_URL || chain.rpcUrls.default.http[0];
}

const DEV_STORAGE_KEY = "airtime.devwallet.connected";

function devWalletConnector(privateKey: Hex, chain: Chain) {
  const account = privateKeyToAccount(privateKey);
  const rpc = browserRpcUrl(chain);
  const wallet = createWalletClient({ account, chain, transport: viemHttp(rpc) });
  const reader = createPublicClient({ chain, transport: viemHttp(rpc) });

  const request = async (args: EIP1193Parameters): Promise<unknown> => {
    const { method, params } = args as { method: string; params?: unknown[] };
    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts":
        return [account.address];
      case "eth_chainId":
        return numberToHex(chain.id);
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
        return null;
      case "personal_sign": {
        const [message] = params as [Hex, string];
        return account.signMessage({ message: { raw: message } });
      }
      case "eth_signTypedData_v4": {
        const [, typed] = params as [string, string];
        const parsed = JSON.parse(typed);
        return account.signTypedData({ domain: parsed.domain, types: parsed.types, primaryType: parsed.primaryType, message: parsed.message });
      }
      case "eth_sendTransaction": {
        const [tx] = params as [{ to?: Hex; data?: Hex; value?: Hex; gas?: Hex }];
        return wallet.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ? hexToBigInt(tx.value) : undefined,
          gas: tx.gas ? hexToBigInt(tx.gas) : undefined,
        });
      }
      default:
        return reader.request(args as never);
    }
  };
  const provider = { request: request as unknown as EIP1193RequestFn };

  return createConnector<typeof provider>(() => ({
    id: "airtimeDev",
    name: "AIRTIME Dev Wallet",
    type: "airtimeDev",
    icon: undefined,
    async setup() {},
    async connect() {
      try {
        localStorage.setItem(DEV_STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
      return { accounts: [account.address], chainId: chain.id } as never;
    },
    async disconnect() {
      try {
        localStorage.removeItem(DEV_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    },
    async getAccounts() {
      return [account.address];
    },
    async getChainId() {
      return chain.id;
    },
    async getProvider() {
      return provider;
    },
    async isAuthorized() {
      try {
        return localStorage.getItem(DEV_STORAGE_KEY) === "1";
      } catch {
        return false;
      }
    },
    async switchChain() {
      return chain;
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}

let cached: Config | null = null;

export function getWagmiConfig(): Config {
  if (cached) return cached;
  const chain = activeChain();
  const connectors = [];
  const devKey = process.env.NEXT_PUBLIC_DEV_WALLET_PRIVATE_KEY;
  if (devKey && /^0x[0-9a-fA-F]{64}$/.test(devKey) && activeChainEnv() !== "mainnet") {
    connectors.push(devWalletConnector(devKey as Hex, chain));
  }
  connectors.push(injected({ shimDisconnect: true }));
  const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (wcProjectId) {
    connectors.push(
      walletConnect({
        projectId: wcProjectId,
        showQrModal: true,
        metadata: {
          name: "AIRTIME",
          description: "Browser-native television and programmable billboard network. Built on Robinhood Chain.",
          url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          icons: [],
        },
      }),
    );
  }
  cached = createConfig({
    chains: [chain],
    connectors,
    transports: { [chain.id]: http(browserRpcUrl(chain), { batch: true }) },
    ssr: true,
  });
  return cached;
}

export const hasDevWallet = () => Boolean(process.env.NEXT_PUBLIC_DEV_WALLET_PRIVATE_KEY) && activeChainEnv() !== "mainnet";
