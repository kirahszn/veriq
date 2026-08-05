import assert from "node:assert/strict";
import test from "node:test";
import { estimatePayoutBps } from "#payout";

const metrics = [7000, 9000, 9800];
const payouts = [0, 8000, 10000];

test("7000 returns 0", () => assert.equal(estimatePayoutBps(metrics, payouts, 7000), 0));
test("9000 returns 8000", () => assert.equal(estimatePayoutBps(metrics, payouts, 9000), 8000));
test("9200 returns 8500", () => assert.equal(estimatePayoutBps(metrics, payouts, 9200), 8500));
test("9800 returns 10000", () => assert.equal(estimatePayoutBps(metrics, payouts, 9800), 10000));
test("8200 returns 4800", () => assert.equal(estimatePayoutBps(metrics, payouts, 8200), 4800));
test("interpolation rounds down", () => assert.equal(estimatePayoutBps([0, 3], [0, 10], 1), 3));
test("invalid curves are rejected", () => {
  const invalidCases: Array<[number[], number[]]> = [
    [[0, 1], [0]], [[0], [0]],
    [[0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 3, 4, 5, 6, 7, 8]],
    [[0, 0], [0, 1]], [[0, 1], [1, 0]], [[0, 10_001], [0, 1]], [[0, 1], [0, 10_001]],
  ];
  for (const [curveMetrics, curvePayouts] of invalidCases) {
    assert.throws(() => estimatePayoutBps(curveMetrics, curvePayouts, 0));
  }
});
test("TypeScript results match known Solidity PayoutCurve cases", () => {
  assert.deepEqual(
    [6999, 7000, 9000, 9200, 9800, 10_000].map((quality) => estimatePayoutBps(metrics, payouts, quality)),
    [0, 0, 8000, 8500, 10_000, 10_000],
  );
});
