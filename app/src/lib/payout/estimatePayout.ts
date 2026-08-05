const MAX_POINTS = 8;
const MAX_BPS = 10_000;
const USDC_SCALE = 1_000_000n;

export function estimatePayoutBps(metricPoints: readonly number[], payoutBps: readonly number[], qualityBps: number): number {
  validateCurve(metricPoints, payoutBps);

  if (qualityBps <= metricPoints[0]) return payoutBps[0];
  const lastIndex = metricPoints.length - 1;
  if (qualityBps >= metricPoints[lastIndex]) return payoutBps[lastIndex];

  for (let index = 1; index < metricPoints.length; index += 1) {
    const upperMetric = metricPoints[index];
    if (qualityBps <= upperMetric) {
      const lowerMetric = metricPoints[index - 1];
      const lowerPayout = payoutBps[index - 1];
      const upperPayout = payoutBps[index];
      return lowerPayout + Math.floor(
        ((qualityBps - lowerMetric) * (upperPayout - lowerPayout)) /
          (upperMetric - lowerMetric),
      );
    }
  }

  return payoutBps[lastIndex];
}

export function validateCurve(metricPoints: readonly number[], payoutBps: readonly number[]): void {
  if (metricPoints.length !== payoutBps.length) throw new Error("PayoutCurveLengthMismatch");
  if (metricPoints.length < 2) throw new Error("PayoutCurveTooFewPoints");
  if (metricPoints.length > MAX_POINTS) throw new Error("PayoutCurveTooManyPoints");

  for (let index = 0; index < metricPoints.length; index += 1) {
    const metric = metricPoints[index];
    const payout = payoutBps[index];
    if (!Number.isInteger(metric) || !Number.isInteger(payout) || metric < 0 || payout < 0 || metric > MAX_BPS || payout > MAX_BPS) {
      throw new Error("PayoutCurveValueOutOfRange");
    }
    if (index > 0 && metric <= metricPoints[index - 1]) throw new Error("PayoutCurveMetricNotIncreasing");
    if (index > 0 && payout < payoutBps[index - 1]) throw new Error("PayoutCurvePayoutNotNonDecreasing");
  }
}

export function parseUsdc(value: string | bigint): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error("USDC amount cannot be negative");
    return value;
  }
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) throw new Error("Invalid USDC amount");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * USDC_SCALE + BigInt(fraction.padEnd(6, "0"));
}

export function calculatePayoutUsdc(budgetUsdc: bigint, payoutBps: number): bigint {
  return (budgetUsdc * BigInt(payoutBps)) / 10_000n;
}
