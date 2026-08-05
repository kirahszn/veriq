import type { Address, Hash, PublicClient, TransactionReceipt, WalletClient } from "viem";
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC_URL, ARC_USDC_ADDRESS, assertArcChainId } from "#arc-chain";

export interface ArcDeploymentRecord {
  chainId: number; rpcHost: string; deployer: Address; veriqEscrow: Address; transactionHash: Hash; blockNumber: string;
}

export function createDeploymentRecord(input: ArcDeploymentRecord): ArcDeploymentRecord {
  assertArcChainId(input.chainId);
  if (input.rpcHost !== new URL(ARC_TESTNET_RPC_URL).host) throw new Error("Unexpected Arc RPC host");
  return { ...input };
}

export function requireSuccessfulArcReceipt(receipt: TransactionReceipt | undefined, label: string): TransactionReceipt {
  if (!receipt) throw new Error(`Missing ${label} receipt`);
  if (receipt.status !== "success") throw new Error(`${label} transaction reverted`);
  return receipt;
}

export function requireDeployedCode(code: `0x${string}` | undefined, label: string): void {
  if (!code || code === "0x") throw new Error(`${label} deployed code is missing`);
}

export function requireBudgetBalance(balance: bigint, budget: bigint): void {
  if (balance < budget) throw new Error(`Insufficient client balance for ${budget} base units`);
}

export function requireOfficialUsdc(address: Address): void {
  if (address.toLowerCase() !== ARC_USDC_ADDRESS.toLowerCase()) throw new Error("Arc deployment must use the official USDC interface");
}

export function calculateLiveSettlement(budget: bigint): { providerPayment: bigint; clientRefund: bigint } {
  const providerPayment = budget * 8_500n / 10_000n;
  return { providerPayment, clientRefund: budget - providerPayment };
}

export function requireExpectedState(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${String(expected)}, received ${String(actual)}`);
}

export async function assertArcConnection(publicClient: PublicClient): Promise<void> {
  assertArcChainId(await publicClient.getChainId());
}

export async function sendSimulatedWrite(
  publicClient: PublicClient, wallet: WalletClient, address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[], label: string,
): Promise<{ hash: Hash; receipt: TransactionReceipt }> {
  await assertArcConnection(publicClient);
  if (!wallet.account) throw new Error(`Missing ${label} wallet account`);
  const simulation = await publicClient.simulateContract({ address, abi, functionName, args, account: wallet.account });
  const hash = await wallet.writeContract(simulation.request);
  const receipt = requireSuccessfulArcReceipt(await publicClient.waitForTransactionReceipt({ hash }), label);
  return { hash, receipt };
}

export { ARC_TESTNET_CHAIN_ID, ARC_USDC_ADDRESS };
