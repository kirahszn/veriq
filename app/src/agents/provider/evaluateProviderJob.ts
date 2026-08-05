import { calculatePayoutUsdc, estimatePayoutBps, parseUsdc } from "#payout";

export interface ProviderJobInput {
  budgetUsdc: string | bigint;
  metricPoints: readonly number[];
  payoutBps: readonly number[];
  estimatedQualityBps: number;
  estimatedExecutionCostUsdc: string | bigint;
  minimumRequiredProfitUsdc: string | bigint;
}

export interface ProviderDecision {
  decision: "ACCEPT" | "REJECT";
  expectedPayoutBps: number;
  expectedPayoutUsdc: bigint;
  estimatedExecutionCostUsdc: bigint;
  expectedProfitUsdc: bigint;
  minimumRequiredProfitUsdc: bigint;
  reason: string;
}

export function evaluateProviderJob(input: ProviderJobInput): ProviderDecision {
  const budgetUsdc = parseUsdc(input.budgetUsdc);
  const estimatedExecutionCostUsdc = parseUsdc(input.estimatedExecutionCostUsdc);
  const minimumRequiredProfitUsdc = parseUsdc(input.minimumRequiredProfitUsdc);
  const expectedPayoutBps = estimatePayoutBps(input.metricPoints, input.payoutBps, input.estimatedQualityBps);
  const expectedPayoutUsdc = calculatePayoutUsdc(budgetUsdc, expectedPayoutBps);
  const expectedProfitUsdc = expectedPayoutUsdc - estimatedExecutionCostUsdc;
  const accepts = expectedProfitUsdc >= minimumRequiredProfitUsdc;

  return {
    decision: accepts ? "ACCEPT" : "REJECT",
    expectedPayoutBps,
    expectedPayoutUsdc,
    estimatedExecutionCostUsdc,
    expectedProfitUsdc,
    minimumRequiredProfitUsdc,
    reason: accepts
      ? "ACCEPT: expected profit meets or exceeds the minimum required profit."
      : "REJECT: expected profit is below the minimum required profit.",
  };
}
