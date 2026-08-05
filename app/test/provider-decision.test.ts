import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateProviderJob, type ProviderJobInput } from "#provider-agent";

const fixture = JSON.parse(readFileSync(new URL("../../fixtures/unprofitable-job.json", import.meta.url), "utf8")) as ProviderJobInput;
const profitable: ProviderJobInput = { ...fixture, budgetUsdc: "200", estimatedQualityBps: 9200 };

test("unprofitable fixture returns REJECT", () => assert.equal(evaluateProviderJob(fixture).decision, "REJECT"));
test("unprofitable fixture returns payoutBps 4800", () => assert.equal(evaluateProviderJob(fixture).expectedPayoutBps, 4800));
test("unprofitable fixture expected payout equals 28.80 USDC in base units", () => assert.equal(evaluateProviderJob(fixture).expectedPayoutUsdc, 28_800_000n));
test("unprofitable fixture expected profit equals 6.80 USDC in base units", () => assert.equal(evaluateProviderJob(fixture).expectedProfitUsdc, 6_800_000n));
test("profitable job returns ACCEPT", () => assert.equal(evaluateProviderJob(profitable).decision, "ACCEPT"));
test("break-even at minimum profit returns ACCEPT", () => {
  const input = { ...fixture, budgetUsdc: "10", estimatedQualityBps: 9800, estimatedExecutionCostUsdc: "7", minimumRequiredProfitUsdc: "3" };
  assert.equal(evaluateProviderJob(input).decision, "ACCEPT");
});
test("profit one base unit below minimum returns REJECT", () => {
  const input = { ...fixture, budgetUsdc: 10_000_000n, estimatedQualityBps: 9800, estimatedExecutionCostUsdc: 7_000_001n, minimumRequiredProfitUsdc: 3_000_000n };
  assert.equal(evaluateProviderJob(input).decision, "REJECT");
});
test("zero execution cost is handled", () => {
  const result = evaluateProviderJob({ ...fixture, estimatedExecutionCostUsdc: "0", minimumRequiredProfitUsdc: "0" });
  assert.equal(result.expectedProfitUsdc, result.expectedPayoutUsdc);
  assert.equal(result.decision, "ACCEPT");
});
test("zero payout produces REJECT when minimum profit is positive", () => {
  const result = evaluateProviderJob({ ...fixture, estimatedQualityBps: 7000, estimatedExecutionCostUsdc: "0", minimumRequiredProfitUsdc: "0.000001" });
  assert.equal(result.expectedPayoutUsdc, 0n);
  assert.equal(result.decision, "REJECT");
});
test("provider decision input objects are not mutated", () => {
  const before = JSON.stringify(fixture);
  evaluateProviderJob(fixture);
  assert.equal(JSON.stringify(fixture), before);
});
