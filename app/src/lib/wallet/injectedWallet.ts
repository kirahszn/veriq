import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  type Address,
  type EIP1193Provider,
} from "viem";
import { mockUsdcReadAbi } from "../arc/abi/mock-usdc-read";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_EXPLORER_URL,
  ARC_TESTNET_RPC_URL,
  ARC_USDC_ADDRESS,
  ARC_USDC_DECIMALS,
  arcTestnet,
} from "../arc/chain";

export type InjectedProvider = EIP1193Provider & {
  on?: (event: "accountsChanged" | "chainChanged" | "disconnect", listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: "accountsChanged" | "chainChanged" | "disconnect", listener: (...args: unknown[]) => void) => void;
};

export class WalletConnectionError extends Error {
  constructor(public readonly kind: "not-installed" | "rejected" | "wrong-network" | "connection", message: string) {
    super(message);
    this.name = "WalletConnectionError";
  }
}

export function getInjectedProvider(): InjectedProvider | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { ethereum?: InjectedProvider }).ethereum ?? null;
}

export async function connectInjectedWallet(provider: InjectedProvider): Promise<Address> {
  try {
    await provider.request({ method: "eth_requestAccounts" });
    const client = createWalletClient({ chain: arcTestnet, transport: custom(provider) });
    const [account] = await client.getAddresses();
    if (!account) throw new WalletConnectionError("connection", "The wallet did not return an account.");
    await ensureArcTestnet(provider);
    const chainId = await client.getChainId();
    if (chainId !== ARC_TESTNET_CHAIN_ID) {
      throw new WalletConnectionError("wrong-network", "The wallet is not connected to Arc Testnet.");
    }
    return account;
  } catch (error) {
    if (error instanceof WalletConnectionError) throw error;
    if (errorCode(error) === 4001) throw new WalletConnectionError("rejected", "The wallet request was rejected.");
    throw new WalletConnectionError("connection", safeMessage(error, "Unable to connect the wallet."));
  }
}

export async function ensureArcTestnet(provider: InjectedProvider): Promise<void> {
  const current = await readInjectedChainId(provider);
  if (current === ARC_TESTNET_CHAIN_ID) return;
  const chainId = `0x${ARC_TESTNET_CHAIN_ID.toString(16)}` as `0x${string}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if (errorCode(error) === 4001) throw new WalletConnectionError("rejected", "The Arc Testnet switch was rejected.");
    if (errorCode(error) !== 4902) {
      throw new WalletConnectionError("wrong-network", "Switch the wallet to Arc Testnet and try again.");
    }
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId,
          chainName: arcTestnet.name,
          nativeCurrency: arcTestnet.nativeCurrency,
          rpcUrls: [ARC_TESTNET_RPC_URL],
          blockExplorerUrls: [ARC_TESTNET_EXPLORER_URL],
        }],
      });
    } catch (addError) {
      if (errorCode(addError) === 4001) throw new WalletConnectionError("rejected", "Adding Arc Testnet was rejected.");
      throw new WalletConnectionError("wrong-network", "Arc Testnet could not be added to the wallet.");
    }
  }
  if (await readInjectedChainId(provider) !== ARC_TESTNET_CHAIN_ID) {
    throw new WalletConnectionError("wrong-network", "The wallet is not connected to Arc Testnet.");
  }
}

export async function readInjectedChainId(provider: InjectedProvider): Promise<number> {
  const value = await provider.request({ method: "eth_chainId" });
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new WalletConnectionError("connection", "The wallet returned an invalid chain ID.");
  }
  return Number.parseInt(value, 16);
}

export async function readInjectedAccounts(provider: InjectedProvider): Promise<readonly Address[]> {
  const value = await provider.request({ method: "eth_accounts" });
  return Array.isArray(value) ? value.filter(item => typeof item === "string" && /^0x[0-9a-f]{40}$/i.test(item)) as Address[] : [];
}

export async function readUsdcBalance(address: Address): Promise<string> {
  const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL) });
  const balance = await client.readContract({
    address: ARC_USDC_ADDRESS,
    abi: mockUsdcReadAbi,
    functionName: "balanceOf",
    args: [address],
  });
  return formatUsdcBalance(balance);
}

export function formatUsdcBalance(balance: bigint): string {
  const [whole, fraction = ""] = formatUnits(balance, ARC_USDC_DECIMALS).split(".");
  return `${whole}.${fraction.padEnd(ARC_USDC_DECIMALS, "0")} USDC`;
}

export function subscribeInjectedWallet(
  provider: InjectedProvider,
  handlers: { accountsChanged: (accounts: readonly string[]) => void; chainChanged: (chainId: string) => void; disconnect: () => void },
): () => void {
  const accounts = (value: unknown) => handlers.accountsChanged(Array.isArray(value) ? value.filter(item => typeof item === "string") : []);
  const chain = (value: unknown) => handlers.chainChanged(typeof value === "string" ? value : "");
  const disconnect = () => handlers.disconnect();
  provider.on?.("accountsChanged", accounts);
  provider.on?.("chainChanged", chain);
  provider.on?.("disconnect", disconnect);
  return () => {
    provider.removeListener?.("accountsChanged", accounts);
    provider.removeListener?.("chainChanged", chain);
    provider.removeListener?.("disconnect", disconnect);
  };
}

function errorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = "code" in error && typeof error.code === "number" ? error.code : undefined;
  if (direct !== undefined) return direct;
  const cause = "cause" in error ? error.cause : undefined;
  return cause && typeof cause === "object" && "code" in cause && typeof cause.code === "number" ? cause.code : undefined;
}

function safeMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message.slice(0, 180) : fallback;
}
