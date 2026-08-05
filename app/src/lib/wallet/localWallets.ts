import { createPublicClient, createWalletClient, http, type Address, type PublicClient, type WalletClient } from "viem";

export const LOCAL_RPC_URL = "http://127.0.0.1:8545";

export type WalletRole = "deployer" | "client" | "provider";

export interface LocalWalletSet {
  publicClient: PublicClient;
  chainId: number;
  deployer: WalletClient;
  client: WalletClient;
  provider: WalletClient;
  addresses: Record<WalletRole, Address>;
}

export async function createLocalWallets(rpcUrl = LOCAL_RPC_URL): Promise<LocalWalletSet> {
  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  const addresses = await createWalletClient({ transport: http(rpcUrl) }).getAddresses();
  if (addresses.length < 3) throw new Error("Anvil must expose at least three unlocked accounts");
  const roleAddresses = { deployer: addresses[0], client: addresses[1], provider: addresses[2] } as Record<WalletRole, Address>;
  if (new Set(Object.values(roleAddresses).map((value) => value.toLowerCase())).size !== 3) throw new Error("Wallet roles must use distinct addresses");
  return {
    publicClient,
    chainId,
    deployer: createWalletClient({ account: roleAddresses.deployer, transport: http(rpcUrl) }),
    client: createWalletClient({ account: roleAddresses.client, transport: http(rpcUrl) }),
    provider: createWalletClient({ account: roleAddresses.provider, transport: http(rpcUrl) }),
    addresses: roleAddresses,
  };
}

export function assertChainId(actual: number, expected: number): void {
  if (actual !== expected) throw new Error(`Chain ID mismatch: expected ${expected}, received ${actual}`);
}

export function assertWalletRole(role: WalletRole, expectedRole: WalletRole): void {
  if (role !== expectedRole) throw new Error(`Wallet role mismatch: ${expectedRole} action cannot be signed by ${role}`);
}

export function validateLocalConfig(config: { rpcUrl?: string }): asserts config is { rpcUrl: string } {
  if (!config.rpcUrl) throw new Error("Missing local RPC URL");
}
