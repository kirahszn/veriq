// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library PayoutCurve {
    error PayoutCurveLengthMismatch();
    error PayoutCurveTooFewPoints();
    error PayoutCurveTooManyPoints();
    error PayoutCurveMetricNotIncreasing();
    error PayoutCurvePayoutNotNonDecreasing();
    error PayoutCurveValueOutOfRange();

    uint256 internal constant MAX_POINTS = 8;
    uint256 internal constant MAX_BPS = 10000;

    function evaluate(uint256 metric, uint256[] memory metricPoints, uint256[] memory payoutPoints)
        internal
        pure
        returns (uint256)
    {
        uint256 length = metricPoints.length;
        if (length != payoutPoints.length) revert PayoutCurveLengthMismatch();
        if (length < 2) revert PayoutCurveTooFewPoints();
        if (length > MAX_POINTS) revert PayoutCurveTooManyPoints();

        if (metricPoints[0] > MAX_BPS || payoutPoints[0] > MAX_BPS) revert PayoutCurveValueOutOfRange();

        for (uint256 i = 1; i < length; i++) {
            uint256 currentMetric = metricPoints[i];
            uint256 currentPayout = payoutPoints[i];
            if (currentMetric > MAX_BPS || currentPayout > MAX_BPS) revert PayoutCurveValueOutOfRange();
            if (currentMetric <= metricPoints[i - 1]) revert PayoutCurveMetricNotIncreasing();
            if (currentPayout < payoutPoints[i - 1]) revert PayoutCurvePayoutNotNonDecreasing();
        }

        if (metric <= metricPoints[0]) {
            return payoutPoints[0];
        }

        uint256 lastIndex = length - 1;
        if (metric >= metricPoints[lastIndex]) {
            return payoutPoints[lastIndex];
        }

        for (uint256 i = 1; i < length; i++) {
            uint256 m2 = metricPoints[i];
            if (metric <= m2) {
                uint256 m1 = metricPoints[i - 1];
                uint256 p1 = payoutPoints[i - 1];
                uint256 p2 = payoutPoints[i];
                if (metric == m1) {
                    return p1;
                }
                uint256 numerator = (metric - m1) * (p2 - p1);
                return p1 + (numerator / (m2 - m1));
            }
        }

        return payoutPoints[lastIndex];
    }
}
