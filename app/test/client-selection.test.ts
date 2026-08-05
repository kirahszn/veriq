import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { selectProvider, type ClientPolicy, type ProviderProfile } from "#client-agent";

const providers = JSON.parse(readFileSync(new URL("../../fixtures/providers.json", import.meta.url), "utf8")) as ProviderProfile[];
const policy: ClientPolicy = {
  taskType: "supplier-data-extraction", scorer: "ExactMatchScorer", maximumBudgetUsdc: "200",
  minimumHistoricalQualityBps: 8000, minimumReliabilityBps: 8500, maximumCompletionSeconds: 300,
};
const base: ProviderProfile = { ...providers[0] };

function rejectionFor(change: Partial<ProviderProfile>, reason: string): void {
  const result = selectProvider([{ ...base, ...change }], policy);
  assert.equal(result.selectedProvider, null);
  assert.deepEqual(result.rejectedProviders[0].reasons, [reason]);
}

test("filters task-type mismatch", () => rejectionFor({ supportedTaskType: "other" }, "Task type is not supported."));
test("filters scorer mismatch", () => rejectionFor({ supportedScorer: "OtherScorer" }, "Scorer is not supported."));
test("filters provider over budget", () => rejectionFor({ requestedMaxPaymentUsdc: "200.000001" }, "Requested payment exceeds the maximum budget."));
test("filters insufficient historical quality", () => rejectionFor({ historicalMeasuredQualityBps: 7999 }, "Historical measured quality is below the minimum."));
test("filters insufficient reliability", () => rejectionFor({ reliabilityBps: 8499 }, "Reliability is below the minimum."));
test("filters excessive completion time", () => rejectionFor({ expectedCompletionSeconds: 301 }, "Expected completion time exceeds the maximum."));
test("strongest eligible provider wins", () => assert.equal(selectProvider(providers, policy).selectedProvider?.address, providers[0].address));
test("cheaper lower-quality provider remains eligible but does not win", () => {
  const result = selectProvider(providers, policy);
  assert.equal(result.rankedEligibleProviders.length, 2);
  assert.equal(result.rankedEligibleProviders[1].address, providers[1].address);
});
test("no eligible providers returns no selection", () => {
  const result = selectProvider([{ ...base, supportedTaskType: "other" }], policy);
  assert.equal(result.selectedProvider, null);
  assert.equal(result.reason, "No provider satisfies every eligibility requirement.");
});
test("ranking is deterministic", () => {
  const first = selectProvider(providers, policy).rankedEligibleProviders.map(({ address }) => address);
  const second = selectProvider([...providers].reverse(), policy).rankedEligibleProviders.map(({ address }) => address);
  assert.deepEqual(first, second);
});

function tied(overridesA: Partial<ProviderProfile>, overridesB: Partial<ProviderProfile>): string {
  const common = { ...base, expectedQualityBps: 9000, historicalMeasuredQualityBps: 9000, reliabilityBps: 9000, expectedCompletionSeconds: 100, requestedMaxPaymentUsdc: "100" };
  const a = { ...common, address: "0x1111111111111111111111111111111111111111", ...overridesA };
  const b = { ...common, address: "0x2222222222222222222222222222222222222222", ...overridesB };
  return selectProvider([b, a], policy).selectedProvider!.address;
}

test("tie-breaker 1 prefers higher selection score", () => assert.equal(tied({ expectedQualityBps: 9001 }, {}), "0x1111111111111111111111111111111111111111"));
test("tie-breaker 2 prefers higher historical quality", () => assert.equal(tied({ expectedQualityBps: 8970, historicalMeasuredQualityBps: 9035 }, {}), "0x1111111111111111111111111111111111111111"));
test("tie-breaker 3 prefers higher reliability", () => assert.equal(tied({ expectedQualityBps: 8950, reliabilityBps: 9070 }, {}), "0x1111111111111111111111111111111111111111"));
test("tie-breaker 4 prefers lower requested payment", () => assert.equal(tied({ requestedMaxPaymentUsdc: "99" }, {}), "0x1111111111111111111111111111111111111111"));
test("tie-breaker 5 prefers lower completion time", () => {
  const winner = tied(
    { expectedQualityBps: 8800, expectedCompletionSeconds: 90 },
    { expectedQualityBps: 9000, expectedCompletionSeconds: 111 },
  );
  assert.equal(winner, "0x1111111111111111111111111111111111111111");
});
test("tie-breaker 6 prefers lexicographically lower address", () => assert.equal(tied({}, {}), "0x1111111111111111111111111111111111111111"));
test("provider input fixtures are not mutated", () => {
  const before = JSON.stringify(providers);
  selectProvider(providers, policy);
  assert.equal(JSON.stringify(providers), before);
});
test("selected provider contains a full score breakdown", () => {
  const breakdown = selectProvider(providers, policy).selectedProvider?.scoreBreakdown;
  assert.ok(breakdown);
  assert.equal(breakdown.selectionScore, breakdown.expectedQualityComponent + breakdown.historicalQualityComponent + breakdown.reliabilityComponent + breakdown.completionComponent);
});
test("rejected providers contain deterministic reasons", () => {
  const rejected = selectProvider(providers, policy).rejectedProviders[0];
  assert.equal(rejected.provider.address, providers[2].address);
  assert.deepEqual(rejected.reasons, ["Task type is not supported."]);
});
