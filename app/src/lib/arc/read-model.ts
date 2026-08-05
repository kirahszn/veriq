import type { Address, Hex } from "viem";
import type { DemoJob, JobStatus } from "../../data/types";

export const VERIFIED_ESCROW_ADDRESS: Address = "0xd7bc6d86afcf8f4fdc02e990222951978afd311b";
export const VERIFIED_JOB_ID = 1n;
export const VERIFIED_PROVIDER: Address = "0xA6Bd2273219904699B67Fb64988a32249dFEc241";
export const VERIFIED_BUDGET = 1_000_000n;
export const ARC_READ_REVALIDATE_SECONDS = 60;

export type ArcDataSource = "LIVE" | "VERIFIED_FALLBACK";
export type ArcRpcState = "Live" | "Unavailable" | "Data mismatch";

export interface NormalizedProviderHistory {
  measuredJobs: bigint;
  cumulativeQualityBps: bigint;
  averageQualityBps: bigint;
  completedJobs: bigint;
  submissionDefaults: bigint;
}

export interface NormalizedBalances {
  escrow: bigint;
  provider: bigint;
  client: bigint;
}

export interface NormalizedLiveJob {
  id: number;
  exists: boolean;
  client: Address;
  provider: Address;
  budget: bigint;
  status: JobStatus;
  qualityBps: number;
  payoutBps: number;
  providerPayment: bigint;
  clientRefund: bigint;
  expectedCommitment: Hex | string;
  providerCommitment: Hex | string;
  deadlines: { acceptance: bigint; submission: bigint; reveal: bigint };
}

export interface ArcReadResult {
  source: ArcDataSource;
  rpcState: ArcRpcState;
  fetchedAt: string;
  chainId: number;
  blockNumber: bigint | null;
  contractAddress: Address;
  job: NormalizedLiveJob;
  providerHistory: NormalizedProviderHistory;
  balances: NormalizedBalances;
  warnings: readonly string[];
}

export function normalizeStatus(value: bigint | number): JobStatus {
  const status = Number(value);
  if (status === 1) return "Funded";
  if (status === 2) return "Accepted";
  if (status === 3) return "Submitted";
  if (status === 4) return "Scored";
  if (status === 5) return "Settled";
  if (status >= 6 && status <= 8) return "Defaulted";
  throw new Error(`Unknown VeriqEscrow status enum: ${String(value)}`);
}

export function requireBps(label: string, value: bigint | number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 10_000) throw new Error(`${label} must be between 0 and 10000`);
  return number;
}

export function requireBigint(label: string, value: unknown): bigint {
  if (typeof value !== "bigint" || value < 0n) throw new Error(`${label} must be a non-negative bigint`);
  return value;
}

export function requireAddress(label: string, value: unknown): Address {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${label} is malformed`);
  return value as Address;
}

export function formatUsdcBaseUnits(value: bigint): string {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function toDemoJob(result: ArcReadResult, verified: DemoJob): DemoJob {
  const job = result.job;
  return { ...verified, client: job.client, provider: job.provider, budgetUsdc: formatUsdcBaseUnits(job.budget), qualityBps: job.qualityBps, payoutBps: job.payoutBps, providerPaymentUsdc: formatUsdcBaseUnits(job.providerPayment), clientRefundUsdc: formatUsdcBaseUnits(job.clientRefund), escrowBalanceUsdc: formatUsdcBaseUnits(result.balances.escrow), status: job.status, deadlines: { acceptance: formatDeadline(job.deadlines.acceptance), submission: formatDeadline(job.deadlines.submission), reveal: formatDeadline(job.deadlines.reveal) }, commitments: { evaluation: job.expectedCommitment, providerResult: job.providerCommitment, verified: job.status === "Settled" } };
}

function formatDeadline(value: bigint): string {
  if (value === 0n) return "Unavailable";
  return new Date(Number(value) * 1000).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC";
}
