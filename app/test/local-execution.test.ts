import assert from "node:assert/strict";
import test, { before } from "node:test";
import { concat, keccak256 } from "viem";
import { selectProvider, type ProviderProfile } from "#client-agent";
import { evaluateProviderJob } from "#provider-agent";
import { buildAnswerFixtures, commitAnswers } from "#answers";
import { assertExpectedValue, assertReceiptSucceeded, deployLocalContracts, validateDeployment, type LocalDeployment } from "#deployment";
import { executeHappyPath, type FlowResult } from "#local-flow";
import { assertChainId, assertWalletRole, createLocalWallets, validateLocalConfig, type LocalWalletSet } from "#wallets";

let wallets: LocalWalletSet;
let deployment: LocalDeployment;
let flow: FlowResult;

before(async () => {
  wallets = await createLocalWallets();
  deployment = await deployLocalContracts(wallets.publicClient, wallets.deployer, wallets.chainId);
  const provider: ProviderProfile = {
    address: wallets.addresses.provider, supportedTaskType: "supplier-data-extraction", supportedScorer: "ExactMatchScorer",
    expectedQualityBps: 9400, historicalMeasuredQualityBps: 9500, reliabilityBps: 9700,
    expectedCompletionSeconds: 180, requestedMaxPaymentUsdc: "200",
  };
  flow = await executeHappyPath(wallets, deployment, [provider]);
});

test("deployer client and provider addresses are distinct", () => assert.equal(new Set(Object.values(wallets.addresses)).size, 3));
test("wallet clients connect to Anvil and chain guard accepts its chain ID", async () => assert.doesNotThrow(() => assertChainId(wallets.chainId, wallets.chainId)));
test("chain guard rejects a mismatched chain ID before a write", () => assert.throws(() => assertChainId(wallets.chainId, wallets.chainId + 1), /Chain ID mismatch/));
test("public wallet helpers expose no private keys", () => assert.equal(JSON.stringify(wallets).includes("privateKey"), false));
test("missing local configuration and deployment addresses fail clearly", () => {
  assert.throws(() => validateLocalConfig({}), /Missing local RPC URL/);
  assert.throws(() => validateDeployment({}), /Missing local deployment addresses/);
});
test("wallet role enforcement rejects client provider-action and provider client-action", () => {
  assert.throws(() => assertWalletRole("client", "provider"), /Wallet role mismatch/);
  assert.throws(() => assertWalletRole("provider", "client"), /Wallet role mismatch/);
});
test("client selection result address is the onchain provider", () => {
  const provider = { address: wallets.addresses.provider, supportedTaskType: "supplier-data-extraction", supportedScorer: "ExactMatchScorer", expectedQualityBps: 9400, historicalMeasuredQualityBps: 9500, reliabilityBps: 9700, expectedCompletionSeconds: 180, requestedMaxPaymentUsdc: "200" };
  assert.equal(selectProvider([provider], { taskType: "supplier-data-extraction", scorer: "ExactMatchScorer", maximumBudgetUsdc: "200", minimumHistoricalQualityBps: 8000, minimumReliabilityBps: 8500, maximumCompletionSeconds: 300 }).selectedProvider?.address, wallets.addresses.provider);
});
test("deterministic 50-answer commitments use ABI encoding and detect changes", () => {
  const answers = buildAnswerFixtures();
  assert.equal(answers.expected.length, 50);
  assert.equal(answers.provider.filter((value, index) => value === answers.expected[index]).length, 46);
  assert.notEqual(answers.expectedCommitment, answers.providerCommitment);
  assert.notEqual(answers.expectedCommitment, keccak256(concat(answers.expected)));
  const changed = [...answers.expected]; changed[0] = answers.provider[49];
  assert.notEqual(commitAnswers(changed), answers.expectedCommitment);
  const reordered = [...answers.expected]; [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.notEqual(commitAnswers(reordered), answers.expectedCommitment);
});
test("profitable decision triggers provider acceptance while reject sends none", () => {
  assert.ok(flow.transactions.accept);
  const reject = evaluateProviderJob({ budgetUsdc: "60", metricPoints: [7000, 9000, 9800], payoutBps: [0, 8000, 10000], estimatedQualityBps: 8200, estimatedExecutionCostUsdc: "22", minimumRequiredProfitUsdc: "30" });
  assert.equal(reject.decision, "REJECT");
  assert.equal(Object.keys(flow.transactions).filter((key) => key === "rejectAcceptance").length, 0);
});
test("local flow uses six-decimal bigint USDC and confirms every transaction", () => {
  assert.equal(flow.providerPayment, 170_000_000n);
  assert.equal(flow.clientRefund, 30_000_000n);
  assert.deepEqual(Object.keys(flow.transactions), ["mint", "approval", "createJob", "accept", "submit", "reveal", "settle"]);
});
test("full local flow reaches Settled with 9200 quality and 8500 payout", () => {
  assert.equal(flow.qualityBps, 9200n);
  assert.equal(flow.payoutBps, 8500n);
  assert.equal(flow.status, 5);
});
test("provider history updates correctly after local settlement", () => assert.deepEqual(flow.history, [1n, 9200n, 9200n, 1n, 0n]));
test("receipt and expected-value guards fail loudly", () => {
  assert.throws(() => assertReceiptSucceeded("reverted"), /receipt failed/);
  assert.throws(() => assertExpectedValue("quality", 1n, 2n), /quality mismatch/);
});
