// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC usdc;
    address alice = address(0x1);
    address bob = address(0x2);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function setUp() public {
        usdc = new MockUSDC();
    }

    function testMetadata() public {
        assertEq(usdc.name(), "Mock USDC");
        assertEq(usdc.symbol(), "mUSDC");
        assertEq(usdc.decimals(), 6);
    }

    function testMintUpdatesBalanceAndSupply() public {
        uint256 amount = 1_000_000; // 1 USDC with 6 decimals
        bool ok = usdc.mint(alice, amount);
        assertTrue(ok);
        assertEq(usdc.balanceOf(alice), amount);
        assertEq(usdc.totalSupply(), amount);
    }

    function testMintToZeroAddressReverts() public {
        uint256 amount = 1_000_000;
        vm.expectRevert(bytes("MockUSDC: mint to zero address"));
        usdc.mint(address(0), amount);
    }

    function testTransferSuccess() public {
        uint256 amount = 2_500_000; // 2.5 USDC
        usdc.mint(alice, amount);
        vm.prank(alice);
        bool ok = usdc.transfer(bob, 1_000_000);
        assertTrue(ok);
        assertEq(usdc.balanceOf(alice), 1_500_000);
        assertEq(usdc.balanceOf(bob), 1_000_000);
    }

    function testTransferToZeroAddressReverts() public {
        uint256 amount = 1_000_000;
        usdc.mint(alice, amount);
        vm.prank(alice);
        vm.expectRevert(bytes("MockUSDC: transfer to zero address"));
        usdc.transfer(address(0), amount);
    }

    function testTransferAboveBalanceReverts() public {
        uint256 amount = 1_000_000;
        usdc.mint(alice, amount);
        vm.prank(alice);
        vm.expectRevert(bytes("MockUSDC: transfer amount exceeds balance"));
        usdc.transfer(bob, amount + 1);
    }

    function testApproveStoresAllowanceAndEmitsApproval() public {
        uint256 amount = 1_000_000;
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit Approval(alice, address(this), amount);
        bool ok = usdc.approve(address(this), amount);
        assertTrue(ok);
        assertEq(usdc.allowance(alice, address(this)), amount);
    }

    function testTransferFromUpdatesBalancesAndReducesAllowance() public {
        uint256 amount = 5_000_000;
        usdc.mint(alice, amount);
        vm.prank(alice);
        usdc.approve(address(this), 3_000_000);

        vm.expectEmit(true, true, false, true);
        emit Transfer(alice, bob, 2_000_000);
        bool ok = usdc.transferFrom(alice, bob, 2_000_000);
        assertTrue(ok);
        assertEq(usdc.balanceOf(alice), 3_000_000);
        assertEq(usdc.balanceOf(bob), 2_000_000);
        assertEq(usdc.allowance(alice, address(this)), 1_000_000);
    }

    function testTransferFromAboveAllowanceReverts() public {
        uint256 amount = 1_000_000;
        usdc.mint(alice, amount);
        vm.prank(alice);
        usdc.approve(address(this), 500_000);
        vm.expectRevert(bytes("MockUSDC: transfer amount exceeds allowance"));
        usdc.transferFrom(alice, bob, 600_000);
    }

    function testTransferFromAboveBalanceReverts() public {
        uint256 mintAmount = 1_000_000;
        usdc.mint(alice, mintAmount);
        vm.prank(alice);
        usdc.approve(address(this), 2_000_000);
        vm.expectRevert(bytes("MockUSDC: transfer amount exceeds balance"));
        usdc.transferFrom(alice, bob, 2_000_000);
    }

    function testMintAndTransferEmitExpectedTransferEvents() public {
        uint256 amount = 1_000_000;
        vm.expectEmit(true, true, false, true);
        emit Transfer(address(0), alice, amount);
        usdc.mint(alice, amount);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit Transfer(alice, bob, amount);
        usdc.transfer(bob, amount);
    }
}
