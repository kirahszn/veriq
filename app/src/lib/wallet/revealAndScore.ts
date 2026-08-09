import { createPublicClient, createWalletClient, custom, decodeEventLog, http, type Address, type Hash, type Hex } from "viem";
import { veriqEscrowRevealAbi } from "../arc/abi/veriq-escrow-reveal";
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC_URL, arcTestnet } from "../arc/chain";
import { buildExpectedAnswerHashes, INTERACTIVE_BUDGET, INTERACTIVE_ESCROW_ADDRESS, INTERACTIVE_EXPECTED_COMMITMENT, INTERACTIVE_PROVIDER_COMMITMENT, type PersistedInteractiveJob } from "../arc/interactive-job";
import { commitAnswers } from "../local-chain/answers";
import { readInjectedAccounts, readInjectedChainId, type InjectedProvider } from "./injectedWallet";

export const REVEAL_SAFETY_BUFFER_SECONDS = 60n;
export const EXPECTED_QUALITY_BPS = 9200n;
export type RevealScorePhase = "validating-job" | "verifying-expected" | "verifying-provider" | "checking-deadline" | "awaiting-confirmation" | "waiting-confirmation" | "confirming-score";
export interface RevealJob { client: Address; provider: Address; budget: bigint; expectedAnswerCommitment: Hex; revealDeadline: bigint; status: number }
export interface JobScoredData { jobId: bigint; qualityBps: bigint }
export interface RevealScoreAdapter {
  revalidate(client: Address): Promise<void>;
  readJob(jobId: bigint): Promise<RevealJob>;
  readResultCommitment(jobId: bigint): Promise<Hex>;
  readStatus(jobId: bigint): Promise<number>;
  readQualityBps(jobId: bigint): Promise<bigint>;
  latestBlockTimestamp(): Promise<bigint>;
  revealAndScore(client: Address, jobId: bigint, expected: readonly Hex[], provider: readonly Hex[]): Promise<Hash>;
  waitForSuccessfulReceipt(hash: Hash): Promise<{ logs: readonly { data: Hex; topics: readonly Hex[] }[] }>;
  decodeJobScored(logs: readonly { data: Hex; topics: readonly Hex[] }[]): JobScoredData;
}

export function verifyRevealFixtures(state: PersistedInteractiveJob): { expected: readonly Hex[]; provider: readonly Hex[] } {
  const expected = buildExpectedAnswerHashes();
  const provider = state.providerAnswerHashes;
  if (expected.length !== 50) throw new Error("Expected fixture must contain exactly 50 answer hashes.");
  if (!provider || provider.length !== 50) throw new Error("Provider fixture must contain exactly 50 answer hashes.");
  if (state.expectedAnswerHashes.length !== 50 || state.expectedAnswerHashes.some((value, index) => value !== expected[index])) throw new Error("Persisted expected fixture does not match the deterministic fixture.");
  if (provider.slice(0, 46).some((value, index) => value !== expected[index]) || provider.slice(46).some((value, index) => value === expected[index + 46])) throw new Error("Persisted provider fixture does not contain the required deterministic mismatches.");
  if (commitAnswers(expected) !== INTERACTIVE_EXPECTED_COMMITMENT) throw new Error("Expected fixture commitment mismatch.");
  if (commitAnswers(provider) !== INTERACTIVE_PROVIDER_COMMITMENT) throw new Error("Provider fixture commitment mismatch.");
  return { expected, provider };
}

export async function validateRevealReadiness(adapter: RevealScoreAdapter, state: PersistedInteractiveJob, connected: Address): Promise<void> {
  await adapter.revalidate(connected);
  await verifyRevealPreconditions(adapter, state, connected, BigInt(state.jobId));
}

export async function executeRevealAndScore(adapter: RevealScoreAdapter, state: PersistedInteractiveJob, connected: Address, onPhase: (phase: RevealScorePhase) => void = () => {}): Promise<PersistedInteractiveJob> {
  const jobId = BigInt(state.jobId);
  onPhase("validating-job");
  await adapter.revalidate(connected);
  const live = await verifyRevealPreconditions(adapter, state, connected, jobId, onPhase);
  const fixtures = verifyRevealFixtures(state);
  onPhase("validating-job");
  await adapter.revalidate(connected);
  await verifyRevealPreconditions(adapter, state, connected, jobId, onPhase);
  onPhase("awaiting-confirmation");
  const hash = await adapter.revealAndScore(connected, jobId, fixtures.expected, fixtures.provider);
  onPhase("waiting-confirmation");
  const receipt = await adapter.waitForSuccessfulReceipt(hash);
  const event = adapter.decodeJobScored(receipt.logs);
  if (event.jobId !== jobId) throw new Error("JobScored job ID mismatch.");
  if (event.qualityBps !== EXPECTED_QUALITY_BPS) throw new Error("JobScored quality value mismatch.");
  onPhase("confirming-score");
  if (await adapter.readStatus(jobId) !== 4) throw new Error("Job was not confirmed Scored on Arc.");
  if (await adapter.readQualityBps(jobId) !== EXPECTED_QUALITY_BPS) throw new Error("Quality score readback mismatch.");
  if ((await adapter.readResultCommitment(jobId)).toLowerCase() !== live.resultCommitment.toLowerCase()) throw new Error("Result commitment changed after scoring.");
  return { ...state, status: "Scored", qualityBps: 9200, revealTransactionHash: hash };
}

async function verifyRevealPreconditions(adapter: RevealScoreAdapter, state: PersistedInteractiveJob, connected: Address, jobId: bigint, onPhase: (phase: RevealScorePhase) => void = () => {}): Promise<RevealJob & { resultCommitment: Hex }> {
  const live = await adapter.readJob(jobId);
  if (connected.toLowerCase() !== live.client.toLowerCase()) throw new Error("Only the job client can reveal and score this result.");
  if (live.client.toLowerCase() !== state.client.toLowerCase() || live.provider.toLowerCase() !== state.provider.toLowerCase() || live.budget !== INTERACTIVE_BUDGET) throw new Error("Live Job does not match saved state.");
  if (live.status !== 3) throw new Error("Job is not Submitted.");
  onPhase("verifying-expected");
  const fixtures = verifyRevealFixtures(state);
  if (commitAnswers(fixtures.expected).toLowerCase() !== live.expectedAnswerCommitment.toLowerCase() || live.expectedAnswerCommitment.toLowerCase() !== INTERACTIVE_EXPECTED_COMMITMENT) throw new Error("Expected commitment does not match the active job.");
  onPhase("verifying-provider");
  const resultCommitment = await adapter.readResultCommitment(jobId);
  if (commitAnswers(fixtures.provider).toLowerCase() !== resultCommitment.toLowerCase() || resultCommitment.toLowerCase() !== INTERACTIVE_PROVIDER_COMMITMENT) throw new Error("Provider commitment does not match the active job.");
  onPhase("checking-deadline");
  if (await adapter.latestBlockTimestamp() + REVEAL_SAFETY_BUFFER_SECONDS >= live.revealDeadline) throw new Error("The reveal deadline is too close or has passed.");
  return { ...live, resultCommitment };
}

export function createBrowserRevealAdapter(provider: InjectedProvider): RevealScoreAdapter {
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL) });
  const walletClient = createWalletClient({ chain: arcTestnet, transport: custom(provider) });
  const revalidate = async (expected: Address) => {
    if (await readInjectedChainId(provider) !== ARC_TESTNET_CHAIN_ID) throw new Error("Wallet must remain on Arc Testnet.");
    const [active] = await readInjectedAccounts(provider);
    if (!active || active.toLowerCase() !== expected.toLowerCase()) throw new Error("Connected client account changed. Reveal stopped.");
  };
  return {
    revalidate,
    async readJob(jobId) { const v = await publicClient.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowRevealAbi, functionName: "getJob", args: [jobId] }); return { client: v[0], provider: v[1], budget: v[2], expectedAnswerCommitment: v[4], revealDeadline: v[8], status: v[9] }; },
    async readResultCommitment(jobId) { return await publicClient.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowRevealAbi, functionName: "getResultCommitment", args: [jobId] }); },
    async readStatus(jobId) { return await publicClient.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowRevealAbi, functionName: "getStatus", args: [jobId] }); },
    async readQualityBps(jobId) { return await publicClient.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowRevealAbi, functionName: "getQualityBps", args: [jobId] }); },
    async latestBlockTimestamp() { return (await publicClient.getBlock({ blockTag: "latest" })).timestamp; },
    async revealAndScore(account, jobId, expected, providerAnswers) { await revalidate(account); const simulation = await publicClient.simulateContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowRevealAbi, functionName: "revealAndScore", args: [jobId, [...expected], [...providerAnswers]], account }); return await walletClient.writeContract(simulation.request); },
    async waitForSuccessfulReceipt(hash) { const receipt = await publicClient.waitForTransactionReceipt({ hash }); if (receipt.status !== "success") throw new Error("Reveal and score transaction reverted."); return { logs: receipt.logs }; },
    decodeJobScored(logs) { for (const log of logs) try { const decoded = decodeEventLog({ abi: veriqEscrowRevealAbi, eventName: "JobScored", data: log.data, topics: [...log.topics] as [] | [Hex, ...Hex[]] }); return decoded.args as JobScoredData; } catch { /* unrelated log */ } throw new Error("Confirmed transaction did not emit JobScored."); },
  };
}
