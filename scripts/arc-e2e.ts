import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatUnits, keccak256, stringToHex, type Address, type Hash } from "viem";
import { selectProvider, type ProviderProfile } from "../app/src/agents/client/selectProvider.ts";
import { evaluateProviderJob } from "../app/src/agents/provider/evaluateProviderJob.ts";
import { ARC_USDC_ADDRESS } from "../app/src/lib/arc/chain.ts";
import { calculateLiveSettlement, requireBudgetBalance, requireDeployedCode, requireExpectedState, sendSimulatedWrite, type ArcDeploymentRecord } from "../app/src/lib/arc/live.ts";
import { loadContractArtifacts } from "../app/src/lib/contracts/artifacts.ts";
import { buildAnswerFixtures } from "../app/src/lib/local-chain/answers.ts";
import { loadArcWallets, requireRoleAddress } from "../app/src/lib/wallet/arcWallets.ts";

const deployment = JSON.parse(readFileSync(resolve("scripts/generated/arc-deployment.json"), "utf8")) as ArcDeploymentRecord;
if (!deployment.veriqEscrow) throw new Error("Missing Arc deployment record");
const wallets = await loadArcWallets(process.env);
const { mockUsdc, veriqEscrow } = loadContractArtifacts();
requireDeployedCode(await wallets.publicClient.getBytecode({ address: deployment.veriqEscrow }), "VeriqEscrow");
const budget = wallets.config.liveJobAmountUsdc;
const starting = {
  deployer: await balances(wallets.config.addresses.deployer), client: await balances(wallets.config.addresses.client),
  provider: await balances(wallets.config.addresses.provider), escrow: await balances(deployment.veriqEscrow),
};
requireBudgetBalance(starting.client.usdc, budget);
for (const role of ["deployer", "client", "provider"] as const) if (starting[role].native < wallets.config.minimumGasBalanceNative) throw new Error(`${role} has insufficient gas balance`);

const profile: ProviderProfile = { address: wallets.config.addresses.provider, supportedTaskType: "supplier-data-extraction", supportedScorer: "ExactMatchScorer", expectedQualityBps: 9400, historicalMeasuredQualityBps: 9500, reliabilityBps: 9700, expectedCompletionSeconds: 180, requestedMaxPaymentUsdc: formatUnits(budget, 6) };
const selected = selectProvider([profile], { taskType: "supplier-data-extraction", scorer: "ExactMatchScorer", maximumBudgetUsdc: budget, minimumHistoricalQualityBps: 8000, minimumReliabilityBps: 8500, maximumCompletionSeconds: 300 }).selectedProvider;
if (!selected) throw new Error("No provider selected");
requireRoleAddress(selected.address as Address, wallets.config.addresses.provider, "selected provider");
const decision = evaluateProviderJob({ budgetUsdc: budget, metricPoints: [7000, 9000, 9800], payoutBps: [0, 8000, 10000], estimatedQualityBps: 9200, estimatedExecutionCostUsdc: budget / 10n, minimumRequiredProfitUsdc: budget / 10n });
if (decision.decision !== "ACCEPT") throw new Error("Profitable Arc job was rejected");

const transactions: Record<string, { hash: Hash; status: string }> = {};
const approval = await sendSimulatedWrite(wallets.publicClient, wallets.client, ARC_USDC_ADDRESS, mockUsdc.abi, "approve", [deployment.veriqEscrow, budget], "approval"); record("approval", approval);
requireExpectedState("allowance", await wallets.publicClient.readContract({ address: ARC_USDC_ADDRESS, abi: mockUsdc.abi, functionName: "allowance", args: [wallets.config.addresses.client, deployment.veriqEscrow] }), budget);

const answers = buildAnswerFixtures();
const block = await wallets.publicClient.getBlock();
const jobId = await wallets.publicClient.readContract({ address: deployment.veriqEscrow, abi: veriqEscrow.abi, functionName: "nextJobId" }) as bigint;
const create = await sendSimulatedWrite(wallets.publicClient, wallets.client, deployment.veriqEscrow, veriqEscrow.abi, "createJob", [wallets.config.addresses.provider, budget, keccak256(stringToHex("arc-live-task")), answers.expectedCommitment, keccak256(stringToHex("canonicalization-v1")), block.timestamp + 3600n, block.timestamp + 7200n, block.timestamp + 10800n, [7000n, 9000n, 9800n], [0n, 8000n, 10000n]], "create job"); record("createJob", create);
await expectStatus(1); requireExpectedState("escrow funded balance", await tokenBalance(deployment.veriqEscrow), starting.escrow.usdc + budget);
const accept = await sendSimulatedWrite(wallets.publicClient, wallets.provider, deployment.veriqEscrow, veriqEscrow.abi, "acceptJob", [jobId], "accept"); record("accept", accept); await expectStatus(2);
const submit = await sendSimulatedWrite(wallets.publicClient, wallets.provider, deployment.veriqEscrow, veriqEscrow.abi, "submitResultCommitment", [jobId, answers.providerCommitment], "submit commitment"); record("submitCommitment", submit); await expectStatus(3);
if (answers.provider.filter((value, index) => value === answers.expected[index]).length !== 46) throw new Error("Provider answers do not contain exactly 46 matches");
const reveal = await sendSimulatedWrite(wallets.publicClient, wallets.client, deployment.veriqEscrow, veriqEscrow.abi, "revealAndScore", [jobId, answers.expected, answers.provider], "reveal and score"); record("revealAndScore", reveal); await expectStatus(4);
requireExpectedState("qualityBps", await wallets.publicClient.readContract({ address: deployment.veriqEscrow, abi: veriqEscrow.abi, functionName: "getQualityBps", args: [jobId] }), 9200n);
requireExpectedState("pre-settlement escrow balance", await tokenBalance(deployment.veriqEscrow), starting.escrow.usdc + budget);
const settle = await sendSimulatedWrite(wallets.publicClient, wallets.client, deployment.veriqEscrow, veriqEscrow.abi, "settle", [jobId], "settle"); record("settle", settle);
const result = await wallets.publicClient.readContract({ address: deployment.veriqEscrow, abi: veriqEscrow.abi, functionName: "getSettlementResult", args: [jobId] }) as readonly [bigint, bigint, bigint, bigint, number];
const expected = calculateLiveSettlement(budget);
requireExpectedState("qualityBps", result[0], 9200n); requireExpectedState("payoutBps", result[1], 8500n);
requireExpectedState("provider payment", result[2], expected.providerPayment); requireExpectedState("client refund", result[3], expected.clientRefund); requireExpectedState("settled status", result[4], 5);
requireExpectedState("final escrow balance", await tokenBalance(deployment.veriqEscrow), starting.escrow.usdc);
const history = await wallets.publicClient.readContract({ address: deployment.veriqEscrow, abi: veriqEscrow.abi, functionName: "getProviderHistory", args: [wallets.config.addresses.provider] }) as readonly bigint[];
if (history.some((value, index) => value !== [1n, 9200n, 9200n, 1n, 0n][index])) throw new Error("Provider history mismatch");
console.log(JSON.stringify({ chainId: deployment.chainId, veriqEscrow: deployment.veriqEscrow, addresses: wallets.config.addresses, liveJobAmountBaseUnits: budget.toString(), startingBalances: Object.fromEntries(Object.entries(starting).map(([key, value]) => [key, { native: formatUnits(value.native, 18), usdcInterface: formatUnits(value.usdc, 6) }])), transactions, jobId: jobId.toString(), qualityBps: result[0].toString(), payoutBps: result[1].toString(), providerPayment: result[2].toString(), clientRefund: result[3].toString(), escrowFinalBalance: (await tokenBalance(deployment.veriqEscrow)).toString(), finalStatus: result[4], providerHistory: history.map(String) }, null, 2));

function record(label: string, transaction: { hash: Hash; receipt: { status: string } }): void { transactions[label] = { hash: transaction.hash, status: transaction.receipt.status }; }
async function tokenBalance(address: Address): Promise<bigint> { return await wallets.publicClient.readContract({ address: ARC_USDC_ADDRESS, abi: mockUsdc.abi, functionName: "balanceOf", args: [address] }) as bigint; }
async function balances(address: Address): Promise<{ native: bigint; usdc: bigint }> { return { native: await wallets.publicClient.getBalance({ address }), usdc: await tokenBalance(address) }; }
async function expectStatus(expected: number): Promise<void> { requireExpectedState("job status", await wallets.publicClient.readContract({ address: deployment.veriqEscrow, abi: veriqEscrow.abi, functionName: "getStatus", args: [jobId] }), expected); }
