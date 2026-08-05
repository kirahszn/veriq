import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC_URL, ARC_USDC_ADDRESS, ARC_USDC_DECIMALS, arcTestnet, assertArcChainId, assertOfficialArcRpc } from "#arc-chain";
import { assertDistinctAddresses, loadArcPublicConfig } from "#arc-config";
import { probeArc, type ArcReadClient } from "#arc-probe";

const keys = [generatePrivateKey(), generatePrivateKey(), generatePrivateKey()];
const environment = { ARC_DEPLOYER_PRIVATE_KEY: keys[0], ARC_CLIENT_PRIVATE_KEY: keys[1], ARC_PROVIDER_PRIVATE_KEY: keys[2] };
const config = loadArcPublicConfig(environment);

function mockClient(overrides: Partial<{ chainId: number; code: `0x${string}` | undefined; decimals: number; symbol: string; native: bigint; usdc: bigint }> = {}): ArcReadClient {
  const values = { chainId: ARC_TESTNET_CHAIN_ID, code: "0x01" as const, decimals: 6, symbol: "USDC", native: 10n ** 18n, usdc: 2_000_000n, ...overrides };
  return {
    async getChainId() { return values.chainId; }, async getBlockNumber() { return 123n; }, async getBytecode() { return values.code; },
    async getBalance() { return values.native; },
    async readContract(args) { if (args.functionName === "decimals") return values.decimals; if (args.functionName === "symbol") return values.symbol; if (args.functionName === "name") return "USD Coin"; return values.usdc; },
  };
}

test("Arc chain definition uses chain ID 5042002", () => assert.equal(arcTestnet.id, 5_042_002));
test("Arc RPC URL uses the official dot-io endpoint", () => assert.equal(ARC_TESTNET_RPC_URL, "https://rpc.testnet.arc.io"));
test("old dot-network Arc endpoint is rejected", () => assert.throws(() => assertOfficialArcRpc("https://rpc.testnet.arc.network")));
test("Arc USDC interface address is correct", () => assert.equal(ARC_USDC_ADDRESS, "0x3600000000000000000000000000000000000000"));
test("ERC-20 USDC decimals are treated as six", () => assert.equal(ARC_USDC_DECIMALS, 6));
test("three role-wallet addresses must be distinct", () => assert.throws(() => assertDistinctAddresses({ deployer: config.addresses.deployer, client: config.addresses.deployer, provider: config.addresses.provider })));
test("missing private-key configuration fails clearly", () => assert.throws(() => loadArcPublicConfig({}), /Missing ARC_DEPLOYER_PRIVATE_KEY/));
test("malformed private key fails clearly", () => assert.throws(() => loadArcPublicConfig({ ...environment, ARC_CLIENT_PRIVATE_KEY: "bad" }), /Malformed ARC_CLIENT_PRIVATE_KEY/));
test("public Arc configuration helpers never return private keys", () => assert.equal(stringify(config).includes("PRIVATE_KEY") || stringify(config).includes(keys[0]), false));
test("generated secrets target an ignored local environment file", () => {
  const ignored = readFileSync(resolve("../.gitignore"), "utf8");
  assert.match(ignored, /^\.env$/m);
});
test("wallet generator refuses accidental overwrite", () => {
  const directory = mkdtempSync(join(tmpdir(), "veriq-wallets-"));
  const script = resolve("../scripts/generate-arc-wallets.ts");
  execFileSync(process.execPath, [script], { cwd: directory });
  assert.throws(() => execFileSync(process.execPath, [script], { cwd: directory, stdio: "pipe" }));
});
test("wallet generator prints public addresses only", () => {
  const directory = mkdtempSync(join(tmpdir(), "veriq-wallets-output-"));
  const output = execFileSync(process.execPath, [resolve("../scripts/generate-arc-wallets.ts")], { cwd: directory, encoding: "utf8" });
  assert.doesNotMatch(output, /0x[0-9a-fA-F]{64}/);
  assert.equal(Object.keys(JSON.parse(output)).length, 3);
});
test("chain mismatch aborts before any write", () => assert.throws(() => assertArcChainId(1), /Arc chain mismatch/));
test("missing USDC code fails the probe", async () => await assert.rejects(probeArc(mockClient({ code: "0x" }), config), /no bytecode/));
test("unexpected USDC decimals fail the probe", async () => await assert.rejects(probeArc(mockClient({ decimals: 18 }), config), /Unexpected Arc USDC decimals/));
test("unexpected USDC symbol fails the probe", async () => await assert.rejects(probeArc(mockClient({ symbol: "USD" }), config), /Unexpected Arc USDC symbol/));
test("wallet-balance reporting uses bigint", async () => {
  const report = await probeArc(mockClient(), config);
  assert.equal(typeof report.wallets[0].nativeBalance, "bigint"); assert.equal(typeof report.wallets[0].usdcBalance, "bigint");
});
test("configurable live amount is parsed into six-decimal bigint units", () => assert.equal(loadArcPublicConfig({ ...environment, ARC_LIVE_JOB_AMOUNT_USDC: "1.25" }).liveJobAmountUsdc, 1_250_000n));
test("zero balances produce NEEDS_FUNDING", async () => assert.ok((await probeArc(mockClient({ native: 0n, usdc: 0n }), config)).wallets.every(({ readiness }) => readiness === "NEEDS_FUNDING")));
test("sufficient balances produce READY", async () => assert.ok((await probeArc(mockClient(), config)).wallets.every(({ readiness }) => readiness === "READY")));
test("Arc probe exposes read operations only and submits no transaction", () => assert.equal("writeContract" in mockClient(), false));
test("Arc input and configuration objects are not mutated", async () => {
  const before = stringify(config); await probeArc(mockClient(), config); assert.equal(stringify(config), before);
});

function stringify(value: unknown): string { return JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item); }
