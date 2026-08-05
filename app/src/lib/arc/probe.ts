import type { Address, Hex } from "viem";
import { ARC_TESTNET_CHAIN_ID, ARC_USDC_ADDRESS, assertArcChainId } from "#arc-chain";
import type { ArcPublicConfig } from "#arc-config";

export const usdcReadAbi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export interface ArcReadClient {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getBytecode(args: { address: Address }): Promise<Hex | undefined>;
  getBalance(args: { address: Address }): Promise<bigint>;
  readContract(args: { address: Address; abi: typeof usdcReadAbi; functionName: "decimals" | "symbol" | "name" | "balanceOf"; args?: readonly [Address] }): Promise<unknown>;
}

export interface ArcProbeReport {
  chainId: number; latestBlock: bigint; usdcCodePresent: boolean; usdcDecimals: number; usdcSymbol: string; usdcName?: string;
  wallets: Array<{ role: "deployer" | "client" | "provider"; address: Address; nativeBalance: bigint; usdcBalance: bigint; readiness: "READY" | "NEEDS_FUNDING" }>;
}

export async function probeArc(client: ArcReadClient, config: ArcPublicConfig): Promise<ArcProbeReport> {
  const chainId = await client.getChainId();
  assertArcChainId(chainId);
  const latestBlock = await client.getBlockNumber();
  const code = await client.getBytecode({ address: ARC_USDC_ADDRESS });
  if (!code || code === "0x") throw new Error("Arc USDC interface has no bytecode");
  const decimals = Number(await client.readContract({ address: ARC_USDC_ADDRESS, abi: usdcReadAbi, functionName: "decimals" }));
  if (decimals !== 6) throw new Error(`Unexpected Arc USDC decimals: ${decimals}`);
  const symbol = String(await client.readContract({ address: ARC_USDC_ADDRESS, abi: usdcReadAbi, functionName: "symbol" }));
  if (symbol !== "USDC") throw new Error(`Unexpected Arc USDC symbol: ${symbol}`);
  let name: string | undefined;
  try { name = String(await client.readContract({ address: ARC_USDC_ADDRESS, abi: usdcReadAbi, functionName: "name" })); } catch { name = undefined; }
  const wallets = await Promise.all((Object.entries(config.addresses) as Array<["deployer" | "client" | "provider", Address]>).map(async ([role, address]) => {
    const nativeBalance = await client.getBalance({ address });
    const usdcBalance = await client.readContract({ address: ARC_USDC_ADDRESS, abi: usdcReadAbi, functionName: "balanceOf", args: [address] }) as bigint;
    if (typeof nativeBalance !== "bigint" || typeof usdcBalance !== "bigint") throw new Error("Wallet balances must be bigint");
    const enoughGas = nativeBalance >= config.minimumGasBalanceNative;
    const enoughUsdc = role !== "client" || usdcBalance >= config.liveJobAmountUsdc;
    return { role, address, nativeBalance, usdcBalance, readiness: enoughGas && enoughUsdc ? "READY" as const : "NEEDS_FUNDING" as const };
  }));
  return { chainId: ARC_TESTNET_CHAIN_ID, latestBlock, usdcCodePresent: true, usdcDecimals: decimals, usdcSymbol: symbol, usdcName: name, wallets };
}
