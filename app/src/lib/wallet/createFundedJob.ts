import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  http,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC_URL, ARC_USDC_ADDRESS, arcTestnet } from "../arc/chain";
import { usdcExecuteAbi } from "../arc/abi/usdc-execute";
import { veriqEscrowExecuteAbi } from "../arc/abi/veriq-escrow-execute";
import {
  INTERACTIVE_BUDGET,
  INTERACTIVE_CANONICALIZATION_HASH,
  INTERACTIVE_ESCROW_ADDRESS,
  INTERACTIVE_EXPECTED_COMMITMENT,
  INTERACTIVE_METRIC_POINTS,
  INTERACTIVE_PAYOUT_BPS,
  INTERACTIVE_PROVIDER_ADDRESS,
  INTERACTIVE_TASK_SPEC_HASH,
  buildInteractiveJobParameters,
  type PersistedInteractiveJob,
} from "../arc/interactive-job";
import { readInjectedAccounts, readInjectedChainId, type InjectedProvider } from "./injectedWallet";

export type CreateFundedJobPhase = "checking-balance" | "checking-allowance" | "approval-required" | "awaiting-approval" | "approval-confirmed" | "creating-job" | "waiting-confirmation" | "confirming-funded";

export interface JobCreatedData { jobId: bigint; client: Address; provider: Address; budget: bigint }
export interface FundedJobReadback {
  client: Address; provider: Address; budget: bigint; taskSpecHash: Hex; expectedAnswerCommitment: Hex;
  canonicalizationVersionHash: Hex; acceptanceDeadline: bigint; submissionDeadline: bigint; revealDeadline: bigint; status: number;
}
export interface CreateFundedJobAdapter {
  revalidate(expectedClient: Address): Promise<void>;
  readBalance(client: Address): Promise<bigint>;
  readAllowance(client: Address): Promise<bigint>;
  approveExact(client: Address, amount: bigint): Promise<Hash>;
  waitForSuccessfulReceipt(hash: Hash, label: string): Promise<{ logs: readonly { data: Hex; topics: readonly Hex[] }[] }>;
  latestBlockTimestamp(): Promise<bigint>;
  createJob(client: Address, args: ReturnType<typeof buildInteractiveJobParameters>): Promise<Hash>;
  decodeJobCreated(logs: readonly { data: Hex; topics: readonly Hex[] }[]): JobCreatedData;
  readJob(jobId: bigint): Promise<FundedJobReadback>;
}

export interface CreateFundedJobResult { persisted: PersistedInteractiveJob; approvalTransactionHash: Hash | null }

export async function executeCreateFundedJob(
  adapter: CreateFundedJobAdapter,
  client: Address,
  onPhase: (phase: CreateFundedJobPhase) => void = () => undefined,
): Promise<CreateFundedJobResult> {
  if (client.toLowerCase() === INTERACTIVE_PROVIDER_ADDRESS.toLowerCase()) throw new Error("The connected client cannot also be the designated provider.");
  await adapter.revalidate(client);
  onPhase("checking-balance");
  if (await adapter.readBalance(client) < INTERACTIVE_BUDGET) throw new Error("At least 1.000000 ERC-20 USDC is required.");
  onPhase("checking-allowance");
  let allowance = await adapter.readAllowance(client);
  let approvalTransactionHash: Hash | null = null;
  if (allowance < INTERACTIVE_BUDGET) {
    onPhase("approval-required");
    await adapter.revalidate(client);
    onPhase("awaiting-approval");
    approvalTransactionHash = await adapter.approveExact(client, INTERACTIVE_BUDGET);
    await adapter.waitForSuccessfulReceipt(approvalTransactionHash, "USDC approval");
    allowance = await adapter.readAllowance(client);
    if (allowance < INTERACTIVE_BUDGET) throw new Error("USDC approval was confirmed but allowance is insufficient.");
    onPhase("approval-confirmed");
  }
  await adapter.revalidate(client);
  const args = buildInteractiveJobParameters(await adapter.latestBlockTimestamp());
  onPhase("creating-job");
  const createTransactionHash = await adapter.createJob(client, args);
  onPhase("waiting-confirmation");
  const receipt = await adapter.waitForSuccessfulReceipt(createTransactionHash, "Create job");
  const created = adapter.decodeJobCreated(receipt.logs);
  verifyJobCreated(created, client);
  onPhase("confirming-funded");
  const job = await adapter.readJob(created.jobId);
  verifyFundedReadback(job, client, args);
  return {
    approvalTransactionHash,
    persisted: {
      version: 1, chainId: ARC_TESTNET_CHAIN_ID, jobId: created.jobId.toString(), client,
      provider: INTERACTIVE_PROVIDER_ADDRESS, createTransactionHash, taskSpecHash: args.taskSpecHash,
      canonicalizationVersionHash: args.canonicalizationVersionHash,
      metricPoints: args.metricPoints.map(String), payoutBps: args.payoutBps.map(String),
      acceptanceDeadline: args.acceptanceDeadline.toString(), submissionDeadline: args.submissionDeadline.toString(),
      revealDeadline: args.revealDeadline.toString(), expectedAnswerCommitment: args.expectedAnswerCommitment,
      expectedAnswerHashes: args.expectedAnswerHashes, budget: "1000000", status: "Funded",
    },
  };
}

export function createBrowserJobAdapter(provider: InjectedProvider): CreateFundedJobAdapter {
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL) });
  const walletClient = createWalletClient({ chain: arcTestnet, transport: custom(provider) });
  const revalidate = async (expectedClient: Address) => {
    if (await readInjectedChainId(provider) !== ARC_TESTNET_CHAIN_ID) throw new Error("Wallet must remain on Arc Testnet.");
    const [active] = await readInjectedAccounts(provider);
    if (!active || active.toLowerCase() !== expectedClient.toLowerCase()) throw new Error("Connected wallet account changed. Creation stopped.");
  };
  return {
    revalidate,
    async readBalance(client) {
      return await publicClient.readContract({ address: ARC_USDC_ADDRESS, abi: usdcExecuteAbi, functionName: "balanceOf", args: [client] });
    },
    async readAllowance(client) {
      return await publicClient.readContract({ address: ARC_USDC_ADDRESS, abi: usdcExecuteAbi, functionName: "allowance", args: [client, INTERACTIVE_ESCROW_ADDRESS] });
    },
    async approveExact(client, amount) {
      await revalidate(client);
      const simulation = await publicClient.simulateContract({ address: ARC_USDC_ADDRESS, abi: usdcExecuteAbi, functionName: "approve", args: [INTERACTIVE_ESCROW_ADDRESS, amount], account: client });
      return await walletClient.writeContract(simulation.request);
    },
    async waitForSuccessfulReceipt(hash, label) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`${label} transaction reverted.`);
      return { logs: receipt.logs };
    },
    async latestBlockTimestamp() { return (await publicClient.getBlock({ blockTag: "latest" })).timestamp; },
    async createJob(client, args) {
      await revalidate(client);
      const simulation = await publicClient.simulateContract({
        address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowExecuteAbi, functionName: "createJob", account: client,
        args: [args.provider, args.budget, args.taskSpecHash, args.expectedAnswerCommitment, args.canonicalizationVersionHash,
          args.acceptanceDeadline, args.submissionDeadline, args.revealDeadline, args.metricPoints, args.payoutBps],
      });
      return await walletClient.writeContract(simulation.request);
    },
    decodeJobCreated(logs) {
      for (const log of logs) {
        try {
          const decoded = decodeEventLog({ abi: veriqEscrowExecuteAbi, eventName: "JobCreated", data: log.data, topics: [...log.topics] as [] | [Hex, ...Hex[]] });
          return decoded.args as JobCreatedData;
        } catch { /* unrelated log */ }
      }
      throw new Error("Confirmed transaction did not emit JobCreated.");
    },
    async readJob(jobId) {
      const value = await publicClient.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowExecuteAbi, functionName: "getJob", args: [jobId] });
      return {
        client: value[0], provider: value[1], budget: value[2], taskSpecHash: value[3], expectedAnswerCommitment: value[4],
        canonicalizationVersionHash: value[5], acceptanceDeadline: value[6], submissionDeadline: value[7], revealDeadline: value[8], status: value[9],
      };
    },
  };
}

export async function validatePersistedJob(state: PersistedInteractiveJob): Promise<boolean> {
  try {
    const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL) });
    const value = await publicClient.readContract({ address: INTERACTIVE_ESCROW_ADDRESS, abi: veriqEscrowExecuteAbi, functionName: "getJob", args: [BigInt(state.jobId)] });
    return value[0].toLowerCase() === state.client.toLowerCase() && value[1].toLowerCase() === state.provider.toLowerCase()
      && value[2] === INTERACTIVE_BUDGET && value[3] === state.taskSpecHash && value[4] === state.expectedAnswerCommitment
      && value[5] === state.canonicalizationVersionHash && value[6].toString() === state.acceptanceDeadline
      && value[7].toString() === state.submissionDeadline && value[8].toString() === state.revealDeadline && value[9] === 1;
  } catch { return false; }
}

function verifyJobCreated(event: JobCreatedData, client: Address): void {
  if (event.client.toLowerCase() !== client.toLowerCase()) throw new Error("JobCreated client mismatch.");
  if (event.provider.toLowerCase() !== INTERACTIVE_PROVIDER_ADDRESS.toLowerCase()) throw new Error("JobCreated provider mismatch.");
  if (event.budget !== INTERACTIVE_BUDGET) throw new Error("JobCreated budget mismatch.");
}

function verifyFundedReadback(job: FundedJobReadback, client: Address, args: ReturnType<typeof buildInteractiveJobParameters>): void {
  if (job.status !== 1) throw new Error("Created job is not Funded.");
  if (job.client.toLowerCase() !== client.toLowerCase() || job.provider.toLowerCase() !== INTERACTIVE_PROVIDER_ADDRESS.toLowerCase()) throw new Error("Created job parties do not match.");
  if (job.budget !== INTERACTIVE_BUDGET || job.taskSpecHash !== INTERACTIVE_TASK_SPEC_HASH || job.expectedAnswerCommitment !== INTERACTIVE_EXPECTED_COMMITMENT || job.canonicalizationVersionHash !== INTERACTIVE_CANONICALIZATION_HASH) throw new Error("Created job policy does not match.");
  if (job.acceptanceDeadline !== args.acceptanceDeadline || job.submissionDeadline !== args.submissionDeadline || job.revealDeadline !== args.revealDeadline) throw new Error("Created job deadlines do not match.");
  if (args.metricPoints.some((value, index) => value !== INTERACTIVE_METRIC_POINTS[index]) || args.payoutBps.some((value, index) => value !== INTERACTIVE_PAYOUT_BPS[index])) throw new Error("Created job payout curve does not match.");
}
