import { createPublicClient, http, type Hex } from "viem";
import { veriqEscrowAcceptAbi } from "../arc/abi/veriq-escrow-accept";
import { veriqEscrowCommitAbi } from "../arc/abi/veriq-escrow-commit";
import { veriqEscrowRevealAbi } from "../arc/abi/veriq-escrow-reveal";
import { veriqEscrowSettleAbi } from "../arc/abi/veriq-escrow-settle";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "../arc/chain";
import { buildProviderAnswerHashes, INTERACTIVE_BUDGET, INTERACTIVE_CANONICALIZATION_HASH, INTERACTIVE_ESCROW_ADDRESS, INTERACTIVE_EXPECTED_COMMITMENT, INTERACTIVE_PROVIDER_COMMITMENT, INTERACTIVE_TASK_SPEC_HASH, type PersistedInteractiveJob } from "../arc/interactive-job";
import type { StoredSettlement } from "../arc/readPayoutPreview";
import type { AcceptanceJob } from "./acceptFundedJob";
import type { ProviderHistory } from "./settleScoredJob";

export async function recoverInteractiveJob(state: PersistedInteractiveJob): Promise<PersistedInteractiveJob> {
  const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL) }), jobId = BigInt(state.jobId);
  const value = await client.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowAcceptAbi, functionName: "getJob", args: [jobId] });
  const [resultCommitment, qualityBps, settlement, history] = await Promise.all([
    client.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowCommitAbi, functionName: "getResultCommitment", args: [jobId] }),
    client.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowRevealAbi, functionName: "getQualityBps", args: [jobId] }),
    client.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowSettleAbi, functionName: "getSettlementResult", args: [jobId] }),
    client.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowSettleAbi, functionName: "getProviderHistory", args: [value[1]] }),
  ]);
  if (value[3] !== INTERACTIVE_TASK_SPEC_HASH || value[4] !== INTERACTIVE_EXPECTED_COMMITMENT || value[5] !== INTERACTIVE_CANONICALIZATION_HASH || value[6].toString() !== state.acceptanceDeadline || value[7].toString() !== state.submissionDeadline || value[8].toString() !== state.revealDeadline) throw new Error("Saved interactive job policy does not match Arc.");
  return reconcileRecoveredJob(state, { client: value[0], provider: value[1], budget: value[2], acceptanceDeadline: value[6], status: value[9] }, resultCommitment, qualityBps, { qualityBps: settlement[0], payoutBps: settlement[1], providerPayment: settlement[2], clientRefund: settlement[3], status: settlement[4] }, { measuredJobs: history[0], cumulativeQualityBps: history[1], averageQualityBps: history[2], completedJobs: history[3], submissionDefaults: history[4] });
}

export function reconcileRecoveredJob(state: PersistedInteractiveJob, live: AcceptanceJob, resultCommitment?: Hex, qualityBps?: bigint, settlement?: StoredSettlement, history?: ProviderHistory): PersistedInteractiveJob {
  if (live.client.toLowerCase() !== state.client.toLowerCase() || live.provider.toLowerCase() !== state.provider.toLowerCase() || live.budget !== INTERACTIVE_BUDGET) throw new Error("Saved interactive job does not match Arc.");
  if (live.status === 1) return { ...state, status: "Funded" };
  if (live.status === 2) return { ...state, status: "Accepted", confirmedProvider: live.provider, acceptanceTransactionHash: state.acceptanceTransactionHash ?? null };
  if (live.status === 3) {
    if (resultCommitment?.toLowerCase() !== INTERACTIVE_PROVIDER_COMMITMENT) throw new Error("Submitted result commitment does not match the deterministic provider fixture.");
    return { ...state, status: "Submitted", confirmedProvider: live.provider, providerAnswerHashes: buildProviderAnswerHashes(), providerResultCommitment: INTERACTIVE_PROVIDER_COMMITMENT, commitTransactionHash: state.commitTransactionHash ?? null, answerCount: 50 };
  }
  if (live.status === 4) {
    if (resultCommitment?.toLowerCase() !== INTERACTIVE_PROVIDER_COMMITMENT || qualityBps !== 9200n) throw new Error("Scored quality or fixture does not match the interactive run.");
    return { ...state, status: "Scored", confirmedProvider: live.provider, providerAnswerHashes: buildProviderAnswerHashes(), providerResultCommitment: INTERACTIVE_PROVIDER_COMMITMENT, commitTransactionHash: state.commitTransactionHash ?? null, answerCount: 50, qualityBps: 9200, revealTransactionHash: state.revealTransactionHash ?? null };
  }
  if (live.status === 5) {
    if (resultCommitment?.toLowerCase() !== INTERACTIVE_PROVIDER_COMMITMENT || qualityBps !== 9200n) throw new Error("Settled job fixture does not match the interactive run.");
    if (!settlement || settlement.qualityBps !== 9200n || settlement.payoutBps !== 8500n || settlement.providerPayment !== 850000n || settlement.clientRefund !== 150000n || settlement.status !== 5) throw new Error("Settled job result does not match the deterministic settlement.");
    if (!history || history.measuredJobs === 0n || history.completedJobs === 0n || history.cumulativeQualityBps < 9200n || history.averageQualityBps !== history.cumulativeQualityBps / history.measuredJobs) throw new Error("Settled provider history is invalid.");
    return { ...state, status: "Settled", confirmedProvider: live.provider, providerAnswerHashes: buildProviderAnswerHashes(), providerResultCommitment: INTERACTIVE_PROVIDER_COMMITMENT, commitTransactionHash: state.commitTransactionHash ?? null, answerCount: 50, qualityBps: 9200, revealTransactionHash: state.revealTransactionHash ?? null, settledPayoutBps: 8500, providerPayment: "850000", clientRefund: "150000", settlementTransactionHash: state.settlementTransactionHash ?? null, providerHistoryUpdated: true };
  }
  throw new Error("Interactive job is no longer Funded, Accepted, Submitted, Scored, or Settled.");
}
