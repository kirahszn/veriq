import { parseUsdc } from "#payout";

export interface ProviderProfile {
  address: string;
  supportedTaskType: string;
  supportedScorer: string;
  expectedQualityBps: number;
  historicalMeasuredQualityBps: number;
  reliabilityBps: number;
  expectedCompletionSeconds: number;
  requestedMaxPaymentUsdc: string;
}

export interface ClientPolicy {
  taskType: string;
  scorer: string;
  maximumBudgetUsdc: string | bigint;
  minimumHistoricalQualityBps: number;
  minimumReliabilityBps: number;
  maximumCompletionSeconds: number;
}

export interface ScoreBreakdown {
  expectedQualityComponent: number;
  historicalQualityComponent: number;
  reliabilityComponent: number;
  completionScoreBps: number;
  completionComponent: number;
  selectionScore: number;
}

export interface RankedProvider extends ProviderProfile {
  scoreBreakdown: ScoreBreakdown;
}

export interface RejectedProvider {
  provider: ProviderProfile;
  reasons: string[];
}

export interface ClientSelectionResult {
  selectedProvider: RankedProvider | null;
  rankedEligibleProviders: RankedProvider[];
  rejectedProviders: RejectedProvider[];
  reason: string;
}

export function selectProvider(providers: readonly ProviderProfile[], policy: ClientPolicy): ClientSelectionResult {
  const maximumBudget = parseUsdc(policy.maximumBudgetUsdc);
  const eligible: RankedProvider[] = [];
  const rejected: RejectedProvider[] = [];

  for (const provider of providers) {
    const reasons: string[] = [];
    if (provider.supportedTaskType !== policy.taskType) reasons.push("Task type is not supported.");
    if (provider.supportedScorer !== policy.scorer) reasons.push("Scorer is not supported.");
    if (parseUsdc(provider.requestedMaxPaymentUsdc) > maximumBudget) reasons.push("Requested payment exceeds the maximum budget.");
    if (provider.historicalMeasuredQualityBps < policy.minimumHistoricalQualityBps) reasons.push("Historical measured quality is below the minimum.");
    if (provider.reliabilityBps < policy.minimumReliabilityBps) reasons.push("Reliability is below the minimum.");
    if (provider.expectedCompletionSeconds > policy.maximumCompletionSeconds) reasons.push("Expected completion time exceeds the maximum.");

    if (reasons.length > 0) {
      rejected.push({ provider: { ...provider }, reasons });
      continue;
    }

    const completionScoreBps = policy.maximumCompletionSeconds === 0
      ? 0
      : Math.max(0, 10_000 - Math.floor((provider.expectedCompletionSeconds * 10_000) / policy.maximumCompletionSeconds));
    const scoreBreakdown: ScoreBreakdown = {
      expectedQualityComponent: provider.expectedQualityBps * 35,
      historicalQualityComponent: provider.historicalMeasuredQualityBps * 30,
      reliabilityComponent: provider.reliabilityBps * 25,
      completionScoreBps,
      completionComponent: completionScoreBps * 10,
      selectionScore: 0,
    };
    scoreBreakdown.selectionScore = scoreBreakdown.expectedQualityComponent + scoreBreakdown.historicalQualityComponent + scoreBreakdown.reliabilityComponent + scoreBreakdown.completionComponent;
    eligible.push({ ...provider, scoreBreakdown });
  }

  eligible.sort(compareProviders);
  return {
    selectedProvider: eligible[0] ?? null,
    rankedEligibleProviders: eligible,
    rejectedProviders: rejected,
    reason: eligible.length === 0
      ? "No provider satisfies every eligibility requirement."
      : "Selected the highest-ranked eligible provider using the deterministic policy.",
  };
}

function compareProviders(left: RankedProvider, right: RankedProvider): number {
  return right.scoreBreakdown.selectionScore - left.scoreBreakdown.selectionScore
    || right.historicalMeasuredQualityBps - left.historicalMeasuredQualityBps
    || right.reliabilityBps - left.reliabilityBps
    || compareBigInt(parseUsdc(left.requestedMaxPaymentUsdc), parseUsdc(right.requestedMaxPaymentUsdc))
    || left.expectedCompletionSeconds - right.expectedCompletionSeconds
    || left.address.localeCompare(right.address);
}

function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
