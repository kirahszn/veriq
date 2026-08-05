import { keccak256, stringToHex, type Address, type Hash } from "viem";
import { selectProvider, type ProviderProfile } from "#client-agent";
import { evaluateProviderJob } from "#provider-agent";
import { parseUsdc } from "#payout";
import { loadContractArtifacts } from "#artifacts";
import { requireSuccessfulReceipt, type LocalDeployment, validateDeployment } from "#deployment";
import { assertChainId, assertWalletRole, type LocalWalletSet } from "#wallets";
import { buildAnswerFixtures } from "#answers";

export interface FlowResult { jobId: bigint; qualityBps: bigint; payoutBps: bigint; providerPayment: bigint; clientRefund: bigint; status: number; history: readonly bigint[]; transactions: Record<string, Hash> }

export async function executeHappyPath(wallets: LocalWalletSet, deployment: LocalDeployment, providers: readonly ProviderProfile[]): Promise<FlowResult> {
  validateDeployment(deployment);
  assertChainId(await wallets.publicClient.getChainId(), deployment.chainId);
  const { mockUsdc, veriqEscrow } = loadContractArtifacts();
  const budget = parseUsdc("200");
  const tx: Record<string, Hash> = {};
  tx.mint = await write(wallets, "deployer", deployment.mockUsdc, mockUsdc.abi, "mint", [wallets.addresses.client, budget]);
  await expectRead(wallets, deployment.mockUsdc, mockUsdc.abi, "balanceOf", [wallets.addresses.client], budget);
  tx.approval = await write(wallets, "client", deployment.mockUsdc, mockUsdc.abi, "approve", [deployment.veriqEscrow, budget]);
  await expectRead(wallets, deployment.mockUsdc, mockUsdc.abi, "allowance", [wallets.addresses.client, deployment.veriqEscrow], budget);

  const selected = selectProvider(providers, { taskType: "supplier-data-extraction", scorer: "ExactMatchScorer", maximumBudgetUsdc: "200", minimumHistoricalQualityBps: 8000, minimumReliabilityBps: 8500, maximumCompletionSeconds: 300 }).selectedProvider;
  if (!selected || selected.address.toLowerCase() !== wallets.addresses.provider.toLowerCase()) throw new Error("Client selection did not choose the onchain provider wallet");
  const answers = buildAnswerFixtures();
  const now = BigInt((await wallets.publicClient.getBlock()).timestamp);
  tx.createJob = await write(wallets, "client", deployment.veriqEscrow, veriqEscrow.abi, "createJob", [wallets.addresses.provider, budget, keccak256(stringToHex("task-spec")), answers.expectedCommitment, keccak256(stringToHex("canonicalization-v1")), now + 100n, now + 200n, now + 300n, [7000n, 9000n, 9800n], [0n, 8000n, 10000n]]);
  const jobId = (await wallets.publicClient.readContract({ address: deployment.veriqEscrow, abi: veriqEscrow.abi, functionName: "nextJobId" }) as bigint) - 1n;
  await expectRead(wallets, deployment.veriqEscrow, veriqEscrow.abi, "getStatus", [jobId], 1);

  const decision = evaluateProviderJob({ budgetUsdc: budget, metricPoints: [7000, 9000, 9800], payoutBps: [0, 8000, 10000], estimatedQualityBps: 9200, estimatedExecutionCostUsdc: "22", minimumRequiredProfitUsdc: "30" });
  if (decision.decision !== "ACCEPT") throw new Error("Profitable provider decision did not accept");
  tx.accept = await write(wallets, "provider", deployment.veriqEscrow, veriqEscrow.abi, "acceptJob", [jobId]);
  await expectRead(wallets, deployment.veriqEscrow, veriqEscrow.abi, "getStatus", [jobId], 2);
  tx.submit = await write(wallets, "provider", deployment.veriqEscrow, veriqEscrow.abi, "submitResultCommitment", [jobId, answers.providerCommitment]);
  await expectRead(wallets, deployment.veriqEscrow, veriqEscrow.abi, "getStatus", [jobId], 3);
  tx.reveal = await write(wallets, "client", deployment.veriqEscrow, veriqEscrow.abi, "revealAndScore", [jobId, answers.expected, answers.provider]);
  await expectRead(wallets, deployment.veriqEscrow, veriqEscrow.abi, "getQualityBps", [jobId], 9200n);
  await expectRead(wallets, deployment.mockUsdc, mockUsdc.abi, "balanceOf", [deployment.veriqEscrow], budget);
  tx.settle = await write(wallets, "client", deployment.veriqEscrow, veriqEscrow.abi, "settle", [jobId]);
  const settlement = await wallets.publicClient.readContract({ address: deployment.veriqEscrow, abi: veriqEscrow.abi, functionName: "getSettlementResult", args: [jobId] }) as readonly [bigint, bigint, bigint, bigint, number];
  const history = await wallets.publicClient.readContract({ address: deployment.veriqEscrow, abi: veriqEscrow.abi, functionName: "getProviderHistory", args: [wallets.addresses.provider] }) as readonly bigint[];
  if (settlement[0] !== 9200n || settlement[1] !== 8500n || settlement[2] !== parseUsdc("170") || settlement[3] !== parseUsdc("30") || settlement[4] !== 5) throw new Error("Unexpected settlement result");
  await expectRead(wallets, deployment.mockUsdc, mockUsdc.abi, "balanceOf", [wallets.addresses.provider], parseUsdc("170"));
  await expectRead(wallets, deployment.mockUsdc, mockUsdc.abi, "balanceOf", [wallets.addresses.client], parseUsdc("30"));
  await expectRead(wallets, deployment.mockUsdc, mockUsdc.abi, "balanceOf", [deployment.veriqEscrow], 0n);
  if (history[0] !== 1n || history[1] !== 9200n || history[2] !== 9200n || history[3] !== 1n || history[4] !== 0n) throw new Error("Unexpected provider history");
  return { jobId, qualityBps: settlement[0], payoutBps: settlement[1], providerPayment: settlement[2], clientRefund: settlement[3], status: settlement[4], history, transactions: tx };
}

async function write(wallets: LocalWalletSet, role: "deployer" | "client" | "provider", address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[]): Promise<Hash> {
  assertWalletRole(role, role);
  const client = wallets[role];
  if (!client.account) throw new Error(`Missing ${role} account`);
  const simulation = await wallets.publicClient.simulateContract({ address, abi, functionName, args, account: client.account });
  const hash = await client.writeContract({ ...simulation.request, chain: null });
  await requireSuccessfulReceipt(wallets.publicClient, hash);
  return hash;
}

async function expectRead(wallets: LocalWalletSet, address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[], expected: unknown): Promise<void> {
  const actual = await wallets.publicClient.readContract({ address, abi, functionName, args });
  if (actual !== expected) throw new Error(`Unexpected ${functionName}: expected ${String(expected)}, received ${String(actual)}`);
}
