// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PayoutCurve.sol";

contract PayoutCurveTest is Test {
    function evaluateCurve(uint256 metric, uint256[] memory metrics, uint256[] memory payouts)
        public
        pure
        returns (uint256)
    {
        return PayoutCurve.evaluate(metric, metrics, payouts);
    }

    function testReturnsZeroAtLowerBound() public {
        uint256[] memory metrics = new uint256[](3);
        metrics[0] = 7000;
        metrics[1] = 9000;
        metrics[2] = 9800;

        uint256[] memory payouts = new uint256[](3);
        payouts[0] = 0;
        payouts[1] = 8000;
        payouts[2] = 10000;

        assertEq(PayoutCurve.evaluate(7000, metrics, payouts), 0);
    }

    function testReturnsZeroBelowLowerBound() public {
        uint256[] memory metrics = new uint256[](3);
        metrics[0] = 7000;
        metrics[1] = 9000;
        metrics[2] = 9800;

        uint256[] memory payouts = new uint256[](3);
        payouts[0] = 0;
        payouts[1] = 8000;
        payouts[2] = 10000;

        assertEq(PayoutCurve.evaluate(6999, metrics, payouts), 0);
    }

    function testReturnsPayoutAtExactUpperPoints() public {
        uint256[] memory metrics = new uint256[](3);
        metrics[0] = 7000;
        metrics[1] = 9000;
        metrics[2] = 9800;

        uint256[] memory payouts = new uint256[](3);
        payouts[0] = 0;
        payouts[1] = 8000;
        payouts[2] = 10000;

        assertEq(PayoutCurve.evaluate(9000, metrics, payouts), 8000);
        assertEq(PayoutCurve.evaluate(9800, metrics, payouts), 10000);
    }

    function testReturnsPayoutAtUpperBound() public {
        uint256[] memory metrics = new uint256[](3);
        metrics[0] = 7000;
        metrics[1] = 9000;
        metrics[2] = 9800;

        uint256[] memory payouts = new uint256[](3);
        payouts[0] = 0;
        payouts[1] = 8000;
        payouts[2] = 10000;

        assertEq(PayoutCurve.evaluate(9801, metrics, payouts), 10000);
        assertEq(PayoutCurve.evaluate(10000, metrics, payouts), 10000);
    }

    function testReturnsInterpolatedValue() public {
        uint256[] memory metrics = new uint256[](3);
        metrics[0] = 7000;
        metrics[1] = 9000;
        metrics[2] = 9800;

        uint256[] memory payouts = new uint256[](3);
        payouts[0] = 0;
        payouts[1] = 8000;
        payouts[2] = 10000;

        assertEq(PayoutCurve.evaluate(9200, metrics, payouts), 8500);
    }

    function testRoundsDownDuringInterpolation() public {
        uint256[] memory metrics = new uint256[](3);
        metrics[0] = 7000;
        metrics[1] = 9000;
        metrics[2] = 9800;

        uint256[] memory payouts = new uint256[](3);
        payouts[0] = 0;
        payouts[1] = 8000;
        payouts[2] = 10000;

        assertEq(PayoutCurve.evaluate(9001, metrics, payouts), 8002);
    }

    function testUnequalLengthsRevert() public {
        uint256[] memory metrics = new uint256[](3);
        metrics[0] = 7000;
        metrics[1] = 9000;
        metrics[2] = 9800;

        uint256[] memory payouts = new uint256[](2);
        payouts[0] = 0;
        payouts[1] = 8000;

        vm.expectRevert();
        this.evaluateCurve(9000, metrics, payouts);
    }

    function testTooFewPointsRevert() public {
        uint256[] memory metrics = new uint256[](1);
        metrics[0] = 7000;

        uint256[] memory payouts = new uint256[](1);
        payouts[0] = 0;

        vm.expectRevert();
        this.evaluateCurve(7000, metrics, payouts);
    }

    function testTooManyPointsRevert() public {
        uint256[] memory metrics = new uint256[](9);
        uint256[] memory payouts = new uint256[](9);
        for (uint256 i = 0; i < 9; i++) {
            metrics[i] = i * 1000;
            payouts[i] = i * 1000;
        }

        vm.expectRevert();
        this.evaluateCurve(5000, metrics, payouts);
    }

    function testNonIncreasingMetricPointsRevert() public {
        uint256[] memory metrics = new uint256[](3);
        metrics[0] = 7000;
        metrics[1] = 9000;
        metrics[2] = 9000;

        uint256[] memory payouts = new uint256[](3);
        payouts[0] = 0;
        payouts[1] = 8000;
        payouts[2] = 10000;

        vm.expectRevert();
        this.evaluateCurve(9000, metrics, payouts);
    }

    function testDecreasingPayoutPointsRevert() public {
        uint256[] memory metrics = new uint256[](3);
        metrics[0] = 7000;
        metrics[1] = 9000;
        metrics[2] = 9800;

        uint256[] memory payouts = new uint256[](3);
        payouts[0] = 0;
        payouts[1] = 8000;
        payouts[2] = 7000;

        vm.expectRevert();
        this.evaluateCurve(9800, metrics, payouts);
    }

    function testMetricValueAboveMaxReverts() public {
        uint256[] memory metrics = new uint256[](2);
        metrics[0] = 5000;
        metrics[1] = 10001;

        uint256[] memory payouts = new uint256[](2);
        payouts[0] = 0;
        payouts[1] = 10000;

        vm.expectRevert();
        this.evaluateCurve(9000, metrics, payouts);
    }

    function testPayoutValueAboveMaxReverts() public {
        uint256[] memory metrics = new uint256[](2);
        metrics[0] = 5000;
        metrics[1] = 10000;

        uint256[] memory payouts = new uint256[](2);
        payouts[0] = 0;
        payouts[1] = 10001;

        vm.expectRevert();
        this.evaluateCurve(9000, metrics, payouts);
    }
}
