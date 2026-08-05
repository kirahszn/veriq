// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library ExactMatchScorer {
    error ArrayLengthMismatch();
    error ArraysMustNotBeEmpty();

    uint256 internal constant MAX_BPS = 10_000;

    function score(bytes32[] memory expectedAnswers, bytes32[] memory providerAnswers)
        internal
        pure
        returns (uint256 qualityBps)
    {
        if (expectedAnswers.length == 0 || providerAnswers.length == 0) {
            revert ArraysMustNotBeEmpty();
        }

        if (expectedAnswers.length != providerAnswers.length) {
            revert ArrayLengthMismatch();
        }

        uint256 totalAnswers = expectedAnswers.length;
        uint256 matches;

        for (uint256 i = 0; i < totalAnswers; i++) {
            if (expectedAnswers[i] == providerAnswers[i]) {
                matches += 1;
            }
        }

        qualityBps = (matches * MAX_BPS) / totalAnswers;
        if (qualityBps > MAX_BPS) {
            qualityBps = MAX_BPS;
        }

        return qualityBps;
    }
}
