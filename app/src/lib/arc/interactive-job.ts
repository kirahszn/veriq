import { encodeAbiParameters, keccak256, stringToHex, type Address, type Hash, type Hex } from "viem";

export const INTERACTIVE_ESCROW_ADDRESS: Address = "0xd7bc6d86afcf8f4fdc02e990222951978afd311b";
export const INTERACTIVE_PROVIDER_ADDRESS: Address = "0x63Fb95A23e81DCf3595c809d9E237eDEFBBB4898";
export const INTERACTIVE_BUDGET = 1_000_000n;
export const INTERACTIVE_TASK_TYPE = "supplier-data-extraction";
export const INTERACTIVE_TASK_SPEC_SOURCE = "arc-live-task";
export const INTERACTIVE_TASK_SPEC_HASH: Hex = "0xfee21ad5bbf4bc221ee25a4f52cc13785004c11c84f118e6cadd0e65d59321dd";
export const INTERACTIVE_SCORER = "ExactMatchScorer";
export const INTERACTIVE_CANONICALIZATION_VERSION = "canonicalization-v1";
export const INTERACTIVE_CANONICALIZATION_HASH: Hex = "0x5263eb612ed941a7d81990074bc20269eb2af7e59b7fa12a63aaea4dd629f108";
export const INTERACTIVE_METRIC_POINTS = [7000n, 9000n, 9800n] as const;
export const INTERACTIVE_PAYOUT_BPS = [0n, 8000n, 10000n] as const;
export const INTERACTIVE_EXPECTED_COMMITMENT: Hex = "0x94bf247d8595ef08f82f1b3d7b75b538d201524e6be889531ec6eeaa3f8b7dc6";
export const INTERACTIVE_STORAGE_KEY = "veriq:arc-testnet:interactive-job:v1";

export function buildExpectedAnswerHashes(): Hex[] {
  return Array.from({ length: 50 }, (_, index) => keccak256(stringToHex(`expected-${index}`)));
}

export function commitExpectedAnswers(answers: readonly Hex[]): Hex {
  if (answers.length !== 50) throw new Error("Exactly 50 expected-answer hashes are required");
  return keccak256(encodeAbiParameters([{ type: "bytes32[]" }], [answers]));
}

export function buildInteractiveJobParameters(blockTimestamp: bigint) {
  const expectedAnswerHashes = buildExpectedAnswerHashes();
  const expectedAnswerCommitment = commitExpectedAnswers(expectedAnswerHashes);
  if (expectedAnswerCommitment !== INTERACTIVE_EXPECTED_COMMITMENT) throw new Error("Interactive answer fixture commitment mismatch");
  if (keccak256(stringToHex(INTERACTIVE_TASK_SPEC_SOURCE)) !== INTERACTIVE_TASK_SPEC_HASH) throw new Error("Interactive task hash mismatch");
  if (keccak256(stringToHex(INTERACTIVE_CANONICALIZATION_VERSION)) !== INTERACTIVE_CANONICALIZATION_HASH) throw new Error("Interactive canonicalization hash mismatch");
  return {
    provider: INTERACTIVE_PROVIDER_ADDRESS, budget: INTERACTIVE_BUDGET, taskSpecHash: INTERACTIVE_TASK_SPEC_HASH,
    expectedAnswerCommitment, canonicalizationVersionHash: INTERACTIVE_CANONICALIZATION_HASH,
    acceptanceDeadline: blockTimestamp + 3600n, submissionDeadline: blockTimestamp + 7200n,
    revealDeadline: blockTimestamp + 10800n, metricPoints: [...INTERACTIVE_METRIC_POINTS], payoutBps: [...INTERACTIVE_PAYOUT_BPS],
    expectedAnswerHashes,
  } as const;
}

export interface PersistedInteractiveJob {
  version: 1;
  chainId: 5_042_002;
  jobId: string;
  client: Address;
  provider: Address;
  createTransactionHash: Hash;
  taskSpecHash: Hex;
  canonicalizationVersionHash: Hex;
  metricPoints: readonly string[];
  payoutBps: readonly string[];
  acceptanceDeadline: string;
  submissionDeadline: string;
  revealDeadline: string;
  expectedAnswerCommitment: Hex;
  expectedAnswerHashes: readonly Hex[];
  budget: "1000000";
  status: "Funded";
}

export function serializeInteractiveJob(state: PersistedInteractiveJob): string { return JSON.stringify(state); }

export function parsePersistedInteractiveJob(value: string | null): PersistedInteractiveJob | null {
  if (!value) return null;
  try {
    const state = JSON.parse(value) as Partial<PersistedInteractiveJob>;
    if (state.version !== 1 || state.chainId !== 5_042_002 || state.status !== "Funded" || state.budget !== "1000000") return null;
    if (!isAddress(state.client) || !isAddress(state.provider) || state.provider.toLowerCase() !== INTERACTIVE_PROVIDER_ADDRESS.toLowerCase()) return null;
    if (!/^\d+$/.test(state.jobId ?? "") || !/^0x[0-9a-f]{64}$/i.test(state.createTransactionHash ?? "")) return null;
    if (state.taskSpecHash !== INTERACTIVE_TASK_SPEC_HASH || state.canonicalizationVersionHash !== INTERACTIVE_CANONICALIZATION_HASH) return null;
    if (state.expectedAnswerCommitment !== INTERACTIVE_EXPECTED_COMMITMENT || !Array.isArray(state.expectedAnswerHashes)) return null;
    if (commitExpectedAnswers(state.expectedAnswerHashes as Hex[]) !== INTERACTIVE_EXPECTED_COMMITMENT) return null;
    if (JSON.stringify(state.metricPoints) !== JSON.stringify(INTERACTIVE_METRIC_POINTS.map(String))) return null;
    if (JSON.stringify(state.payoutBps) !== JSON.stringify(INTERACTIVE_PAYOUT_BPS.map(String))) return null;
    for (const deadline of [state.acceptanceDeadline, state.submissionDeadline, state.revealDeadline]) if (!/^\d+$/.test(deadline ?? "")) return null;
    return state as PersistedInteractiveJob;
  } catch { return null; }
}

function isAddress(value: unknown): value is Address { return typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value); }
