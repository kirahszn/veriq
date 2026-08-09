import { createPublicClient, createWalletClient, custom, decodeEventLog, http, type Address, type Hash, type Hex } from "viem";
import { veriqEscrowCommitAbi } from "../arc/abi/veriq-escrow-commit";
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC_URL, arcTestnet } from "../arc/chain";
import { buildProviderAnswerHashes, INTERACTIVE_BUDGET, INTERACTIVE_ESCROW_ADDRESS, INTERACTIVE_PROVIDER_COMMITMENT, type PersistedInteractiveJob } from "../arc/interactive-job";
import { readInjectedAccounts, readInjectedChainId, type InjectedProvider } from "./injectedWallet";

export const SUBMISSION_SAFETY_BUFFER_SECONDS = 60n;
export const ZERO_COMMITMENT: Hex = `0x${"0".repeat(64)}`;
export type CommitResultPhase = "validating-job" | "verifying-fixture" | "building-commitment" | "awaiting-confirmation" | "waiting-confirmation" | "confirming-commitment";
export interface CommitmentJob { client: Address; provider: Address; budget: bigint; submissionDeadline: bigint; status: number }
export interface ResultCommittedData { jobId: bigint; provider: Address }
export interface CommitResultAdapter {
  revalidate(provider: Address): Promise<void>;
  readJob(jobId: bigint): Promise<CommitmentJob>;
  readResultCommitment(jobId: bigint): Promise<Hex>;
  latestBlockTimestamp(): Promise<bigint>;
  submitResultCommitment(provider: Address, jobId: bigint, commitment: Hex): Promise<Hash>;
  waitForSuccessfulReceipt(hash: Hash): Promise<{ logs: readonly { data: Hex; topics: readonly Hex[] }[] }>;
  decodeResultCommitted(logs: readonly { data: Hex; topics: readonly Hex[] }[]): ResultCommittedData;
}

export function verifyProviderFixture(): readonly Hex[] {
  const answers = buildProviderAnswerHashes();
  if (answers.length !== 50) throw new Error("Provider result must contain exactly 50 answer hashes.");
  return answers;
}

export async function executeCommitProviderResult(adapter: CommitResultAdapter, state: PersistedInteractiveJob, connected: Address, onPhase: (phase: CommitResultPhase) => void = () => {}): Promise<PersistedInteractiveJob> {
  const jobId = BigInt(state.jobId);
  onPhase("validating-job");
  await adapter.revalidate(connected);
  await verifyCommitPreconditions(adapter, state, connected, jobId);
  onPhase("verifying-fixture");
  const answers = verifyProviderFixture();
  onPhase("building-commitment");
  await adapter.revalidate(connected);
  await verifyCommitPreconditions(adapter, state, connected, jobId);
  if (verifyProviderFixture().some((answer, index) => answer !== answers[index])) throw new Error("Provider fixture changed during validation.");
  onPhase("awaiting-confirmation");
  const hash = await adapter.submitResultCommitment(connected, jobId, INTERACTIVE_PROVIDER_COMMITMENT);
  onPhase("waiting-confirmation");
  const receipt = await adapter.waitForSuccessfulReceipt(hash);
  const event = adapter.decodeResultCommitted(receipt.logs);
  if (event.jobId !== jobId) throw new Error("ResultCommitted job ID mismatch.");
  if (event.provider.toLowerCase() !== connected.toLowerCase()) throw new Error("ResultCommitted provider mismatch.");
  onPhase("confirming-commitment");
  if ((await adapter.readResultCommitment(jobId)).toLowerCase() !== INTERACTIVE_PROVIDER_COMMITMENT) throw new Error("Result commitment readback mismatch.");
  const submitted = await adapter.readJob(jobId);
  if (submitted.status !== 3 || submitted.provider.toLowerCase() !== connected.toLowerCase()) throw new Error("Job was not confirmed Submitted on Arc.");
  return { ...state, status: "Submitted", providerAnswerHashes: [...answers], providerResultCommitment: INTERACTIVE_PROVIDER_COMMITMENT, commitTransactionHash: hash, confirmedProvider: connected, answerCount: 50 };
}

async function verifyCommitPreconditions(adapter: CommitResultAdapter, state: PersistedInteractiveJob, connected: Address, jobId: bigint): Promise<void> {
  const live = await adapter.readJob(jobId);
  if (connected.toLowerCase() !== live.provider.toLowerCase()) throw new Error("Only the assigned provider can commit this result.");
  if (live.client.toLowerCase() !== state.client.toLowerCase() || live.provider.toLowerCase() !== state.provider.toLowerCase() || live.budget !== INTERACTIVE_BUDGET) throw new Error("Live Job does not match saved state.");
  if (live.status !== 2) throw new Error("Job is not Accepted.");
  if ((await adapter.readResultCommitment(jobId)).toLowerCase() !== ZERO_COMMITMENT) throw new Error("Job already has a result commitment.");
  const now = await adapter.latestBlockTimestamp();
  if (now + SUBMISSION_SAFETY_BUFFER_SECONDS >= live.submissionDeadline) throw new Error("The submission deadline is too close or has passed.");
}

export function createBrowserCommitAdapter(provider: InjectedProvider): CommitResultAdapter {
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL) });
  const walletClient = createWalletClient({ chain: arcTestnet, transport: custom(provider) });
  const revalidate = async (expected: Address) => {
    if (await readInjectedChainId(provider) !== ARC_TESTNET_CHAIN_ID) throw new Error("Wallet must remain on Arc Testnet.");
    const [active] = await readInjectedAccounts(provider);
    if (!active || active.toLowerCase() !== expected.toLowerCase()) throw new Error("Connected provider account changed. Result commitment stopped.");
  };
  const readJob = async (jobId: bigint): Promise<CommitmentJob> => {
    const value = await publicClient.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowCommitAbi, functionName: "getJob", args: [jobId] });
    return { client: value[0], provider: value[1], budget: value[2], submissionDeadline: value[7], status: value[9] };
  };
  return {
    revalidate, readJob,
    async readResultCommitment(jobId) { return await publicClient.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowCommitAbi, functionName: "getResultCommitment", args: [jobId] }); },
    async latestBlockTimestamp() { return (await publicClient.getBlock({ blockTag: "latest" })).timestamp; },
    async submitResultCommitment(account, jobId, commitment) {
      await revalidate(account);
      const simulation = await publicClient.simulateContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowCommitAbi, functionName: "submitResultCommitment", args: [jobId, commitment], account });
      return await walletClient.writeContract(simulation.request);
    },
    async waitForSuccessfulReceipt(hash) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Result commitment transaction reverted.");
      return { logs: receipt.logs };
    },
    decodeResultCommitted(logs) {
      for (const log of logs) try {
        const decoded = decodeEventLog({ abi: veriqEscrowCommitAbi, eventName: "ResultCommitted", data: log.data, topics: [...log.topics] as [] | [Hex, ...Hex[]] });
        return decoded.args as ResultCommittedData;
      } catch { /* unrelated log */ }
      throw new Error("Confirmed transaction did not emit ResultCommitted.");
    },
  };
}
