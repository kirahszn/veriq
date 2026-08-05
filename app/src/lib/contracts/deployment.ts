import type { Address, Hash, PublicClient, WalletClient } from "viem";
import { assertChainId } from "#wallets";
import { loadContractArtifacts } from "#artifacts";

export interface LocalDeployment {
  chainId: number;
  deployer: Address;
  mockUsdc: Address;
  veriqEscrow: Address;
  transactions: { mockUsdc: Hash; veriqEscrow: Hash };
}

export async function deployLocalContracts(publicClient: PublicClient, deployer: WalletClient, expectedChainId: number): Promise<LocalDeployment> {
  const chainId = await publicClient.getChainId();
  assertChainId(chainId, expectedChainId);
  if (!deployer.account) throw new Error("Missing deployer account");
  const artifacts = loadContractArtifacts();
  const tokenHash = await deployer.deployContract({ abi: artifacts.mockUsdc.abi, bytecode: artifacts.mockUsdc.bytecode.object, account: deployer.account, chain: null });
  const tokenReceipt = await requireSuccessfulReceipt(publicClient, tokenHash);
  if (!tokenReceipt.contractAddress) throw new Error("MockUSDC deployment address missing");
  const escrowHash = await deployer.deployContract({ abi: artifacts.veriqEscrow.abi, bytecode: artifacts.veriqEscrow.bytecode.object, args: [tokenReceipt.contractAddress], account: deployer.account, chain: null });
  const escrowReceipt = await requireSuccessfulReceipt(publicClient, escrowHash);
  if (!escrowReceipt.contractAddress) throw new Error("VeriqEscrow deployment address missing");
  return { chainId, deployer: deployer.account.address, mockUsdc: tokenReceipt.contractAddress, veriqEscrow: escrowReceipt.contractAddress, transactions: { mockUsdc: tokenHash, veriqEscrow: escrowHash } };
}

export async function requireSuccessfulReceipt(publicClient: PublicClient, hash: Hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction failed: ${hash}`);
  return receipt;
}

export function validateDeployment(value: Partial<LocalDeployment>): asserts value is LocalDeployment {
  if (!value.mockUsdc || !value.veriqEscrow) throw new Error("Missing local deployment addresses");
}

export function assertReceiptSucceeded(status: "success" | "reverted"): void {
  if (status !== "success") throw new Error("Transaction receipt failed");
}

export function assertExpectedValue(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${String(expected)}, received ${String(actual)}`);
}
