import type { Abi, Address, Hex } from "viem";
import { ARC_TESTNET_CHAIN_ID, ARC_USDC_ADDRESS, assertArcChainId } from "./chain";
import { requireDeployedCode, requireOfficialUsdc } from "./live";
import { demo } from "../../data/demo";
import { ARC_READ_REVALIDATE_SECONDS, VERIFIED_BUDGET, VERIFIED_ESCROW_ADDRESS, VERIFIED_JOB_ID, VERIFIED_PROVIDER, normalizeStatus, requireAddress, requireBigint, requireBps, type ArcReadResult, type NormalizedLiveJob, type NormalizedProviderHistory } from "./read-model";

export interface ArcContractReadClient {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getBytecode(args: { address: Address }): Promise<Hex | undefined>;
  readContract(args: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }): Promise<unknown>;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function readLiveArcState(client: ArcContractReadClient, escrowAbi: Abi, usdcAbi: Abi, now = new Date()): Promise<ArcReadResult> {
  const chainId = await client.getChainId();
  assertArcChainId(chainId);
  const blockNumber = await client.getBlockNumber();
  requireDeployedCode(await client.getBytecode({ address: VERIFIED_ESCROW_ADDRESS }), "VeriqEscrow");
  const token = requireAddress("Escrow token", await client.readContract({ address: VERIFIED_ESCROW_ADDRESS, abi: escrowAbi, functionName: "escrowToken" }));
  requireOfficialUsdc(token);
  const jobTuple = asTuple(await client.readContract({ address: VERIFIED_ESCROW_ADDRESS, abi: escrowAbi, functionName: "getJob", args: [VERIFIED_JOB_ID] }), 10, "job");
  const clientAddress = requireAddress("Job client", jobTuple[0]);
  const provider = requireAddress("Job provider", jobTuple[1]);
  if (clientAddress.toLowerCase() === ZERO_ADDRESS || provider.toLowerCase() === ZERO_ADDRESS || Number(jobTuple[9]) === 0) throw new Error("Job #1 does not exist");
  const settlement = asTuple(await client.readContract({ address: VERIFIED_ESCROW_ADDRESS, abi: escrowAbi, functionName: "getSettlementResult", args: [VERIFIED_JOB_ID] }), 5, "settlement");
  const status = normalizeStatus(requireStatusValue(settlement[4]));
  const qualityBps = requireBps("qualityBps", requireBigint("qualityBps", settlement[0]));
  const payoutBps = requireBps("payoutBps", requireBigint("payoutBps", settlement[1]));
  const providerPayment = requireBigint("Provider payment", settlement[2]);
  const clientRefund = requireBigint("Client refund", settlement[3]);
  const budget = requireBigint("Budget", jobTuple[2]);
  const expectedCommitment = requireHex32("Expected commitment", jobTuple[4]);
  const providerCommitment = requireHex32("Provider commitment", await client.readContract({ address: VERIFIED_ESCROW_ADDRESS, abi: escrowAbi, functionName: "getResultCommitment", args: [VERIFIED_JOB_ID] }));
  const historyTuple = asTuple(await client.readContract({ address: VERIFIED_ESCROW_ADDRESS, abi: escrowAbi, functionName: "getProviderHistory", args: [provider] }), 5, "provider history");
  const providerHistory = normalizeHistory(historyTuple);
  const [escrowBalance, providerBalance, clientBalance] = await Promise.all([VERIFIED_ESCROW_ADDRESS, provider, clientAddress].map(address => client.readContract({ address: ARC_USDC_ADDRESS, abi: usdcAbi, functionName: "balanceOf", args: [address] }).then(value => requireBigint("USDC balance", value))));
  if (status === "Settled" && providerPayment + clientRefund !== budget) throw new Error("Settled accounting does not equal budget");
  const job: NormalizedLiveJob = { id: 1, exists: true, client: clientAddress, provider, budget, status, qualityBps, payoutBps, providerPayment, clientRefund, expectedCommitment, providerCommitment, deadlines: { acceptance: requireBigint("Acceptance deadline", jobTuple[6]), submission: requireBigint("Submission deadline", jobTuple[7]), reveal: requireBigint("Reveal deadline", jobTuple[8]) } };
  const warnings = integrityWarnings(job, providerHistory, escrowBalance);
  return { source: "LIVE", rpcState: warnings.length ? "Data mismatch" : "Live", fetchedAt: now.toISOString(), chainId, blockNumber, contractAddress: VERIFIED_ESCROW_ADDRESS, job, providerHistory, balances: { escrow: escrowBalance, provider: providerBalance, client: clientBalance }, warnings };
}

export function verifiedFallback(reason = "Arc RPC is temporarily unavailable. Showing the verified Milestone 13B result.", now = new Date()): ArcReadResult {
  const j = demo.verifiedJob;
  return { source: "VERIFIED_FALLBACK", rpcState: "Unavailable", fetchedAt: now.toISOString(), chainId: ARC_TESTNET_CHAIN_ID, blockNumber: null, contractAddress: VERIFIED_ESCROW_ADDRESS, job: { id: 1, exists: true, client: j.client, provider: j.provider, budget: VERIFIED_BUDGET, status: j.status, qualityBps: j.qualityBps!, payoutBps: j.payoutBps!, providerPayment: 850_000n, clientRefund: 150_000n, expectedCommitment: j.commitments.evaluation, providerCommitment: j.commitments.providerResult, deadlines: { acceptance: 0n, submission: 0n, reveal: 0n } }, providerHistory: { measuredJobs: 1n, cumulativeQualityBps: 9200n, averageQualityBps: 9200n, completedJobs: 1n, submissionDefaults: 0n }, balances: { escrow: 0n, provider: 0n, client: 0n }, warnings: [safeWarning(reason)] };
}

export async function readArcWithFallback(client: ArcContractReadClient, escrowAbi: Abi, usdcAbi: Abi, now = new Date()): Promise<ArcReadResult> {
  try { return await readLiveArcState(client, escrowAbi, usdcAbi, now); }
  catch (error) { return verifiedFallback(classifyReadFailure(error), now); }
}

export function integrityWarnings(job: NormalizedLiveJob, history: NormalizedProviderHistory, escrowBalance: bigint): string[] {
  const warnings: string[] = [];
  if (job.provider.toLowerCase() !== VERIFIED_PROVIDER.toLowerCase()) warnings.push(`Provider mismatch: expected ${VERIFIED_PROVIDER}, live ${job.provider}.`);
  if (job.budget !== VERIFIED_BUDGET) warnings.push(`Budget mismatch: expected ${VERIFIED_BUDGET} base units, live ${job.budget}.`);
  if (job.qualityBps !== 9200) warnings.push(`Quality mismatch: expected 9200 bps, live ${job.qualityBps} bps.`);
  if (job.payoutBps !== 8500) warnings.push(`Payout mismatch: expected 8500 bps, live ${job.payoutBps} bps.`);
  if (job.status !== "Settled") warnings.push(`Status mismatch: expected Settled, live ${job.status}.`);
  if (job.status === "Settled" && escrowBalance !== 0n) warnings.push(`Escrow currently holds ${escrowBalance} USDC base units; this may include unrelated funds.`);
  if (history.measuredJobs !== 1n || history.cumulativeQualityBps !== 9200n || history.averageQualityBps !== 9200n || history.completedJobs !== 1n || history.submissionDefaults !== 0n) warnings.push("Provider history differs from the previously verified result.");
  return warnings;
}

function normalizeHistory(tuple: readonly unknown[]): NormalizedProviderHistory {
  return { measuredJobs: requireBigint("measuredJobs", tuple[0]), cumulativeQualityBps: requireBigint("cumulativeQualityBps", tuple[1]), averageQualityBps: BigInt(requireBps("averageQualityBps", requireBigint("averageQualityBps", tuple[2]))), completedJobs: requireBigint("completedJobs", tuple[3]), submissionDefaults: requireBigint("submissionDefaults", tuple[4]) };
}

function asTuple(value: unknown, length: number, label: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length !== length) throw new Error(`Unsupported ${label} response`);
  return value;
}

function requireHex32(label: string, value: unknown): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} is malformed`);
  return value as Hex;
}

function requireStatusValue(value: unknown): bigint | number {
  if (typeof value === "bigint" && value >= 0n) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  throw new Error("Job status is malformed");
}

function classifyReadFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "Arc read failed";
  if (/chain mismatch/i.test(message)) return "Arc returned the wrong chain ID. Showing the verified Milestone 13B result.";
  if (/bytecode|deployed code/i.test(message)) return "VeriqEscrow bytecode is unavailable. Showing the verified Milestone 13B result.";
  if (/does not exist/i.test(message)) return "Job #1 is unavailable onchain. Showing the verified Milestone 13B result.";
  return "Arc RPC is temporarily unavailable. Showing the verified Milestone 13B result.";
}

function safeWarning(value: string): string {
  return value.replace(/0x[0-9a-fA-F]{64}/g, "[redacted]").slice(0, 240);
}

export { ARC_READ_REVALIDATE_SECONDS };
