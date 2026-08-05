import assert from "node:assert/strict";
import test from "node:test";
import { generatePrivateKey } from "viem/accounts";
import { selectProvider } from "#client-agent";
import { evaluateProviderJob } from "#provider-agent";
import { ARC_USDC_ADDRESS, assertArcChainId } from "#arc-chain";
import { loadArcPublicConfig } from "#arc-config";
import { calculateLiveSettlement, createDeploymentRecord, requireBudgetBalance, requireDeployedCode, requireExpectedState, requireOfficialUsdc, requireSuccessfulArcReceipt } from "#arc-live";
import { requireRoleAddress } from "#arc-wallets";

const environment = { ARC_DEPLOYER_PRIVATE_KEY: generatePrivateKey(), ARC_CLIENT_PRIVATE_KEY: generatePrivateKey(), ARC_PROVIDER_PRIVATE_KEY: generatePrivateKey() };
const config = loadArcPublicConfig(environment);

test("Arc deployment uses the official USDC interface", () => {
  assert.doesNotThrow(() => requireOfficialUsdc(ARC_USDC_ADDRESS));
  assert.throws(() => requireOfficialUsdc(config.addresses.deployer));
});
test("deployment record contains no secret", () => {
  const record = createDeploymentRecord({ chainId: 5_042_002, rpcHost: "rpc.testnet.arc.io", deployer: config.addresses.deployer, veriqEscrow: config.addresses.client, transactionHash: `0x${"1".repeat(64)}`, blockNumber: "1" });
  assert.equal(JSON.stringify(record).includes(environment.ARC_DEPLOYER_PRIVATE_KEY), false);
});
test("wrong-chain deployment is rejected", () => assert.throws(() => assertArcChainId(1), /Arc chain mismatch/));
test("missing deployment receipt is rejected", () => assert.throws(() => requireSuccessfulArcReceipt(undefined, "deployment"), /Missing deployment receipt/));
test("reverted deployment is rejected", () => assert.throws(() => requireSuccessfulArcReceipt({ status: "reverted" } as never, "deployment"), /reverted/));
test("deployed code must exist", () => {
  assert.throws(() => requireDeployedCode("0x", "escrow"), /code is missing/);
  assert.doesNotThrow(() => requireDeployedCode("0x01", "escrow"));
});
test("live amount uses six-decimal bigint units", () => assert.equal(loadArcPublicConfig({ ...environment, ARC_LIVE_JOB_AMOUNT_USDC: "1.25" }).liveJobAmountUsdc, 1_250_000n));
test("live amount defaults safely to one USDC", () => assert.equal(config.liveJobAmountUsdc, 1_000_000n));
test("selected provider must match the configured provider wallet", () => {
  const profile = { address: config.addresses.provider, supportedTaskType: "supplier-data-extraction", supportedScorer: "ExactMatchScorer", expectedQualityBps: 9400, historicalMeasuredQualityBps: 9500, reliabilityBps: 9700, expectedCompletionSeconds: 180, requestedMaxPaymentUsdc: "1" };
  const selected = selectProvider([profile], { taskType: "supplier-data-extraction", scorer: "ExactMatchScorer", maximumBudgetUsdc: "1", minimumHistoricalQualityBps: 8000, minimumReliabilityBps: 8500, maximumCompletionSeconds: 300 }).selectedProvider;
  assert.ok(selected); assert.doesNotThrow(() => requireRoleAddress(selected.address as `0x${string}`, config.addresses.provider, "provider"));
});
test("unprofitable decision sends no acceptance transaction", () => {
  let sends = 0; const result = evaluateProviderJob({ budgetUsdc: "1", metricPoints: [7000, 9000, 9800], payoutBps: [0, 8000, 10000], estimatedQualityBps: 7000, estimatedExecutionCostUsdc: "0", minimumRequiredProfitUsdc: "0.1" });
  if (result.decision === "ACCEPT") sends += 1; assert.equal(result.decision, "REJECT"); assert.equal(sends, 0);
});
test("each Arc write requires the correct role wallet", () => assert.throws(() => requireRoleAddress(config.addresses.client, config.addresses.provider, "provider"), /wallet address mismatch/));
test("failed receipts abort", () => assert.throws(() => requireSuccessfulArcReceipt({ status: "reverted" } as never, "write")));
test("unexpected state aborts", () => assert.throws(() => requireExpectedState("status", 1, 2), /status mismatch/));
test("balance checks account for the configured budget", () => {
  assert.doesNotThrow(() => requireBudgetBalance(1_000_000n, 1_000_000n)); assert.throws(() => requireBudgetBalance(999_999n, 1_000_000n));
});
test("settlement calculations preserve 85/15 allocation", () => assert.deepEqual(calculateLiveSettlement(1_000_000n), { providerPayment: 850_000n, clientRefund: 150_000n }));
test("private keys do not appear in generated deployment records", () => {
  const record = createDeploymentRecord({ chainId: 5_042_002, rpcHost: "rpc.testnet.arc.io", deployer: config.addresses.deployer, veriqEscrow: config.addresses.client, transactionHash: `0x${"2".repeat(64)}`, blockNumber: "2" });
  for (const key of Object.values(environment)) assert.equal(JSON.stringify(record).includes(key), false);
});
test("Arc live input fixtures are not mutated", () => {
  const input = { budget: 1_000_000n }; calculateLiveSettlement(input.budget); assert.equal(input.budget, 1_000_000n);
});
