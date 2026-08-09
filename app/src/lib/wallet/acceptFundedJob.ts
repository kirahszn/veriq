import { createPublicClient, createWalletClient, custom, decodeEventLog, http, type Address, type Hash, type Hex } from "viem";
import { veriqEscrowAcceptAbi } from "../arc/abi/veriq-escrow-accept";
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC_URL, arcTestnet } from "../arc/chain";
import { INTERACTIVE_BUDGET, INTERACTIVE_CANONICALIZATION_HASH, INTERACTIVE_ESCROW_ADDRESS, INTERACTIVE_EXPECTED_COMMITMENT, INTERACTIVE_TASK_SPEC_HASH, type PersistedInteractiveJob } from "../arc/interactive-job";
import { readInjectedAccounts, readInjectedChainId, type InjectedProvider } from "./injectedWallet";

export const ACCEPTANCE_SAFETY_BUFFER_SECONDS = 60n;
export interface AcceptanceJob { client: Address; provider: Address; budget: bigint; acceptanceDeadline: bigint; status: number }
export interface JobAcceptedData { jobId: bigint; provider: Address }
export interface AcceptJobAdapter {
  revalidate(provider: Address): Promise<void>;
  readJob(jobId: bigint): Promise<AcceptanceJob>;
  latestBlockTimestamp(): Promise<bigint>;
  acceptJob(provider: Address, jobId: bigint): Promise<Hash>;
  waitForSuccessfulReceipt(hash: Hash): Promise<{ logs: readonly { data: Hex; topics: readonly Hex[] }[] }>;
  decodeJobAccepted(logs: readonly { data: Hex; topics: readonly Hex[] }[]): JobAcceptedData;
}

export async function executeAcceptJob(adapter: AcceptJobAdapter, state: PersistedInteractiveJob, connected: Address): Promise<PersistedInteractiveJob> {
  const jobId = BigInt(state.jobId);
  await adapter.revalidate(connected);
  const live = await adapter.readJob(jobId);
  verifyAssignedJob(live, state, connected);
  const now = await adapter.latestBlockTimestamp();
  if (now + ACCEPTANCE_SAFETY_BUFFER_SECONDS >= live.acceptanceDeadline) throw new Error("The acceptance deadline is too close or has passed.");
  await adapter.revalidate(connected);
  const immediate = await adapter.readJob(jobId);
  verifyAssignedJob(immediate, state, connected);
  if (await adapter.latestBlockTimestamp() + ACCEPTANCE_SAFETY_BUFFER_SECONDS >= immediate.acceptanceDeadline) throw new Error("The acceptance deadline is too close or has passed.");
  const hash = await adapter.acceptJob(connected, jobId);
  const receipt = await adapter.waitForSuccessfulReceipt(hash);
  const event = adapter.decodeJobAccepted(receipt.logs);
  if (event.jobId !== jobId) throw new Error("JobAccepted job ID mismatch.");
  if (event.provider.toLowerCase() !== connected.toLowerCase()) throw new Error("JobAccepted provider mismatch.");
  const accepted = await adapter.readJob(jobId);
  if (accepted.status !== 2 || accepted.provider.toLowerCase() !== connected.toLowerCase()) throw new Error("Job was not confirmed Accepted on Arc.");
  return { ...state, status: "Accepted", acceptanceTransactionHash: hash, confirmedProvider: connected };
}

export function createBrowserAcceptAdapter(provider: InjectedProvider): AcceptJobAdapter {
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL) });
  const walletClient = createWalletClient({ chain: arcTestnet, transport: custom(provider) });
  const revalidate = async (expected: Address) => {
    if (await readInjectedChainId(provider) !== ARC_TESTNET_CHAIN_ID) throw new Error("Wallet must remain on Arc Testnet.");
    const [active] = await readInjectedAccounts(provider);
    if (!active || active.toLowerCase() !== expected.toLowerCase()) throw new Error("Connected provider account changed. Acceptance stopped.");
  };
  const readJob = async (jobId: bigint): Promise<AcceptanceJob> => {
    const value = await publicClient.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowAcceptAbi, functionName: "getJob", args: [jobId] });
    return { client: value[0], provider: value[1], budget: value[2], acceptanceDeadline: value[6], status: value[9] };
  };
  return {
    revalidate, readJob,
    async latestBlockTimestamp() { return (await publicClient.getBlock({ blockTag: "latest" })).timestamp; },
    async acceptJob(account, jobId) {
      await revalidate(account);
      const simulation = await publicClient.simulateContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowAcceptAbi, functionName: "acceptJob", args: [jobId], account });
      return await walletClient.writeContract(simulation.request);
    },
    async waitForSuccessfulReceipt(hash) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Accept job transaction reverted.");
      return { logs: receipt.logs };
    },
    decodeJobAccepted(logs) {
      for (const log of logs) try {
        const decoded = decodeEventLog({ abi: veriqEscrowAcceptAbi, eventName: "JobAccepted", data: log.data, topics: [...log.topics] as [] | [Hex, ...Hex[]] });
        return decoded.args as JobAcceptedData;
      } catch { /* unrelated log */ }
      throw new Error("Confirmed transaction did not emit JobAccepted.");
    },
  };
}

export async function recoverInteractiveJob(state: PersistedInteractiveJob): Promise<PersistedInteractiveJob> {
  const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL) });
  const value = await client.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowAcceptAbi, functionName: "getJob", args: [BigInt(state.jobId)] });
  if(value[3]!==INTERACTIVE_TASK_SPEC_HASH||value[4]!==INTERACTIVE_EXPECTED_COMMITMENT||value[5]!==INTERACTIVE_CANONICALIZATION_HASH||value[6].toString()!==state.acceptanceDeadline||value[7].toString()!==state.submissionDeadline||value[8].toString()!==state.revealDeadline)throw new Error("Saved interactive job policy does not match Arc.");
  return reconcileRecoveredJob(state,{client:value[0],provider:value[1],budget:value[2],acceptanceDeadline:value[6],status:value[9]});
}
export function reconcileRecoveredJob(state:PersistedInteractiveJob,live:AcceptanceJob):PersistedInteractiveJob{
  if (live.client.toLowerCase() !== state.client.toLowerCase() || live.provider.toLowerCase() !== state.provider.toLowerCase() || live.budget !== INTERACTIVE_BUDGET) throw new Error("Saved interactive job does not match Arc.");
  if (live.status === 1) return { ...state, status: "Funded" };
  if (live.status === 2) return { ...state, status: "Accepted", confirmedProvider: live.provider, acceptanceTransactionHash: state.acceptanceTransactionHash ?? null };
  throw new Error("Interactive job is no longer Funded or Accepted.");
}

function verifyAssignedJob(live: AcceptanceJob, state: PersistedInteractiveJob, connected: Address): void {
  if (live.status !== 1) throw new Error("Job is not Funded.");
  if (live.client.toLowerCase() !== state.client.toLowerCase() || live.provider.toLowerCase() !== state.provider.toLowerCase() || live.budget !== INTERACTIVE_BUDGET) throw new Error("Live Job does not match saved state.");
  if (connected.toLowerCase() !== live.provider.toLowerCase()) throw new Error("Only the assigned provider can accept this job.");
}
