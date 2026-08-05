// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ExactMatchScorer.sol";

contract ExactMatchScorerHarness is Test {
    function score(bytes32[] memory expectedAnswers, bytes32[] memory providerAnswers) public pure returns (uint256) {
        return ExactMatchScorer.score(expectedAnswers, providerAnswers);
    }
}

contract ExactMatchScorerTest is Test {
    ExactMatchScorerHarness internal harness;

    function setUp() public {
        harness = new ExactMatchScorerHarness();
    }

    function testReturns10000ForAll50Matches() public {
        bytes32[] memory expectedAnswers = new bytes32[](50);
        bytes32[] memory providerAnswers = new bytes32[](50);

        for (uint256 i = 0; i < 50; i++) {
            expectedAnswers[i] = keccak256(abi.encodePacked("answer-", i));
            providerAnswers[i] = expectedAnswers[i];
        }

        assertEq(harness.score(expectedAnswers, providerAnswers), 10_000);
    }

    function testReturns9200For46Of50Matches() public {
        bytes32[] memory expectedAnswers = new bytes32[](50);
        bytes32[] memory providerAnswers = new bytes32[](50);

        for (uint256 i = 0; i < 50; i++) {
            expectedAnswers[i] = keccak256(abi.encodePacked("answer-", i));
            providerAnswers[i] = expectedAnswers[i];
        }

        for (uint256 i = 46; i < 50; i++) {
            providerAnswers[i] = keccak256(abi.encodePacked("different-", i));
        }

        assertEq(harness.score(expectedAnswers, providerAnswers), 9_200);
    }

    function testReturnsZeroForNoMatches() public {
        bytes32[] memory expectedAnswers = new bytes32[](50);
        bytes32[] memory providerAnswers = new bytes32[](50);

        for (uint256 i = 0; i < 50; i++) {
            expectedAnswers[i] = keccak256(abi.encodePacked("answer-", i));
            providerAnswers[i] = keccak256(abi.encodePacked("different-", i));
        }

        assertEq(harness.score(expectedAnswers, providerAnswers), 0);
    }

    function testRoundsDownForOneOfThreeMatches() public {
        bytes32[] memory expectedAnswers = new bytes32[](3);
        bytes32[] memory providerAnswers = new bytes32[](3);
        expectedAnswers[0] = keccak256(abi.encodePacked("answer-0"));
        expectedAnswers[1] = keccak256(abi.encodePacked("answer-1"));
        expectedAnswers[2] = keccak256(abi.encodePacked("answer-2"));

        providerAnswers[0] = expectedAnswers[0];
        providerAnswers[1] = keccak256(abi.encodePacked("different-1"));
        providerAnswers[2] = keccak256(abi.encodePacked("different-2"));

        assertEq(harness.score(expectedAnswers, providerAnswers), 3_333);
    }

    function testReturns10000ForEqualSingleElementArrays() public {
        bytes32[] memory expectedAnswers = new bytes32[](1);
        bytes32[] memory providerAnswers = new bytes32[](1);
        expectedAnswers[0] = keccak256(abi.encodePacked("answer-0"));
        providerAnswers[0] = expectedAnswers[0];

        assertEq(harness.score(expectedAnswers, providerAnswers), 10_000);
    }

    function testReturnsZeroForUnequalSingleElementArrays() public {
        bytes32[] memory expectedAnswers = new bytes32[](1);
        bytes32[] memory providerAnswers = new bytes32[](1);
        expectedAnswers[0] = keccak256(abi.encodePacked("answer-0"));
        providerAnswers[0] = keccak256(abi.encodePacked("different-0"));

        assertEq(harness.score(expectedAnswers, providerAnswers), 0);
    }

    function testCountsMismatchAtFirstIndex() public {
        bytes32[] memory expectedAnswers = new bytes32[](3);
        bytes32[] memory providerAnswers = new bytes32[](3);
        expectedAnswers[0] = keccak256(abi.encodePacked("answer-0"));
        expectedAnswers[1] = keccak256(abi.encodePacked("answer-1"));
        expectedAnswers[2] = keccak256(abi.encodePacked("answer-2"));
        providerAnswers[0] = keccak256(abi.encodePacked("different-0"));
        providerAnswers[1] = expectedAnswers[1];
        providerAnswers[2] = expectedAnswers[2];

        assertEq(harness.score(expectedAnswers, providerAnswers), 6_666);
    }

    function testCountsMismatchAtLastIndex() public {
        bytes32[] memory expectedAnswers = new bytes32[](3);
        bytes32[] memory providerAnswers = new bytes32[](3);
        expectedAnswers[0] = keccak256(abi.encodePacked("answer-0"));
        expectedAnswers[1] = keccak256(abi.encodePacked("answer-1"));
        expectedAnswers[2] = keccak256(abi.encodePacked("answer-2"));
        providerAnswers[0] = expectedAnswers[0];
        providerAnswers[1] = expectedAnswers[1];
        providerAnswers[2] = keccak256(abi.encodePacked("different-2"));

        assertEq(harness.score(expectedAnswers, providerAnswers), 6_666);
    }

    function testCountsMultipleMismatches() public {
        bytes32[] memory expectedAnswers = new bytes32[](5);
        bytes32[] memory providerAnswers = new bytes32[](5);
        expectedAnswers[0] = keccak256(abi.encodePacked("answer-0"));
        expectedAnswers[1] = keccak256(abi.encodePacked("answer-1"));
        expectedAnswers[2] = keccak256(abi.encodePacked("answer-2"));
        expectedAnswers[3] = keccak256(abi.encodePacked("answer-3"));
        expectedAnswers[4] = keccak256(abi.encodePacked("answer-4"));

        providerAnswers[0] = expectedAnswers[0];
        providerAnswers[1] = keccak256(abi.encodePacked("different-1"));
        providerAnswers[2] = expectedAnswers[2];
        providerAnswers[3] = keccak256(abi.encodePacked("different-3"));
        providerAnswers[4] = expectedAnswers[4];

        assertEq(harness.score(expectedAnswers, providerAnswers), 6_000);
    }

    function testRevertsWhenArrayLengthsDiffer() public {
        bytes32[] memory expectedAnswers = new bytes32[](2);
        bytes32[] memory providerAnswers = new bytes32[](1);
        expectedAnswers[0] = keccak256(abi.encodePacked("answer-0"));
        expectedAnswers[1] = keccak256(abi.encodePacked("answer-1"));
        providerAnswers[0] = expectedAnswers[0];

        vm.expectRevert(ExactMatchScorer.ArrayLengthMismatch.selector);
        harness.score(expectedAnswers, providerAnswers);
    }

    function testRevertsWhenBothArraysAreEmpty() public {
        bytes32[] memory expectedAnswers = new bytes32[](0);
        bytes32[] memory providerAnswers = new bytes32[](0);

        vm.expectRevert(ExactMatchScorer.ArraysMustNotBeEmpty.selector);
        harness.score(expectedAnswers, providerAnswers);
    }

    function testRevertsWhenExpectedArrayIsEmpty() public {
        bytes32[] memory expectedAnswers = new bytes32[](0);
        bytes32[] memory providerAnswers = new bytes32[](1);
        providerAnswers[0] = keccak256(abi.encodePacked("answer-0"));

        vm.expectRevert(ExactMatchScorer.ArraysMustNotBeEmpty.selector);
        harness.score(expectedAnswers, providerAnswers);
    }

    function testRevertsWhenProviderArrayIsEmpty() public {
        bytes32[] memory expectedAnswers = new bytes32[](1);
        bytes32[] memory providerAnswers = new bytes32[](0);
        expectedAnswers[0] = keccak256(abi.encodePacked("answer-0"));

        vm.expectRevert(ExactMatchScorer.ArraysMustNotBeEmpty.selector);
        harness.score(expectedAnswers, providerAnswers);
    }

    function testDoesNotModifyInputArrays() public {
        bytes32[] memory expectedAnswers = new bytes32[](2);
        bytes32[] memory providerAnswers = new bytes32[](2);
        expectedAnswers[0] = keccak256(abi.encodePacked("answer-0"));
        expectedAnswers[1] = keccak256(abi.encodePacked("answer-1"));
        providerAnswers[0] = keccak256(abi.encodePacked("answer-0"));
        providerAnswers[1] = keccak256(abi.encodePacked("different-1"));

        uint256 initialExpected0 = uint256(expectedAnswers[0]);
        uint256 initialExpected1 = uint256(expectedAnswers[1]);
        uint256 initialProvider0 = uint256(providerAnswers[0]);
        uint256 initialProvider1 = uint256(providerAnswers[1]);

        harness.score(expectedAnswers, providerAnswers);

        assertEq(uint256(expectedAnswers[0]), initialExpected0);
        assertEq(uint256(expectedAnswers[1]), initialExpected1);
        assertEq(uint256(providerAnswers[0]), initialProvider0);
        assertEq(uint256(providerAnswers[1]), initialProvider1);
    }

    function testResultNeverExceeds10000() public {
        bytes32[] memory expectedAnswers = new bytes32[](2);
        bytes32[] memory providerAnswers = new bytes32[](2);
        expectedAnswers[0] = keccak256(abi.encodePacked("answer-0"));
        expectedAnswers[1] = keccak256(abi.encodePacked("answer-1"));
        providerAnswers[0] = expectedAnswers[0];
        providerAnswers[1] = expectedAnswers[1];

        uint256 qualityBps = harness.score(expectedAnswers, providerAnswers);
        assertLe(qualityBps, 10_000);
    }
}
