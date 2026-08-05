import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { parseUsdc } from "#payout";

const ROLE_KEYS = ["ARC_DEPLOYER_PRIVATE_KEY", "ARC_CLIENT_PRIVATE_KEY", "ARC_PROVIDER_PRIVATE_KEY"] as const;

export interface ArcPublicConfig {
  addresses: { deployer: Address; client: Address; provider: Address };
  liveJobAmountUsdc: bigint;
  minimumGasBalanceNative: bigint;
}

export function loadArcPublicConfig(environment: Record<string, string | undefined>): ArcPublicConfig {
  const accounts = ROLE_KEYS.map((name) => {
    const value = environment[name];
    if (!value) throw new Error(`Missing ${name}`);
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`Malformed ${name}`);
    return privateKeyToAccount(value as Hex);
  });
  const addresses = { deployer: accounts[0].address, client: accounts[1].address, provider: accounts[2].address };
  assertDistinctAddresses(addresses);
  return {
    addresses,
    liveJobAmountUsdc: parseUsdc(environment.ARC_LIVE_JOB_AMOUNT_USDC ?? "1"),
    minimumGasBalanceNative: parseNative(environment.ARC_MIN_GAS_BALANCE_NATIVE ?? "0.01"),
  };
}

export function assertDistinctAddresses(addresses: Record<string, Address>): void {
  if (new Set(Object.values(addresses).map((value) => value.toLowerCase())).size !== 3) throw new Error("Arc role-wallet addresses must be distinct");
}

export function parseNative(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(value)) throw new Error("Invalid native amount");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}
