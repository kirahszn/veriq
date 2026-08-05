import { createPublicClient, createWalletClient, http, type Address, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_TESTNET_RPC_URL, arcTestnet, assertArcChainId } from "#arc-chain";
import { loadArcPublicConfig, type ArcPublicConfig } from "#arc-config";

export interface ArcWalletSet {
  publicClient: PublicClient;
  deployer: WalletClient;
  client: WalletClient;
  provider: WalletClient;
  config: ArcPublicConfig;
}

export async function loadArcWallets(environment: Record<string, string | undefined>): Promise<ArcWalletSet> {
  const config = loadArcPublicConfig(environment);
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL) });
  assertArcChainId(await publicClient.getChainId());
  const make = (name: "ARC_DEPLOYER_PRIVATE_KEY" | "ARC_CLIENT_PRIVATE_KEY" | "ARC_PROVIDER_PRIVATE_KEY") =>
    createWalletClient({ account: privateKeyToAccount(environment[name] as `0x${string}`), chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL) });
  return { publicClient, deployer: make("ARC_DEPLOYER_PRIVATE_KEY"), client: make("ARC_CLIENT_PRIVATE_KEY"), provider: make("ARC_PROVIDER_PRIVATE_KEY"), config };
}

export function requireRoleAddress(actual: Address, expected: Address, role: string): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error(`${role} wallet address mismatch`);
}
