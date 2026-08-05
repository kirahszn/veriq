// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/MockUSDC.sol";
import "../src/VeriqEscrow.sol";

interface ITestToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract RevertingTransferToken is ITestToken {
    mapping(address => uint256) public balanceOf;
    address public escrow;
    uint256 public jobId;
    bool public reenterAcceptanceExpiry;

    constructor() {}

    function setEscrowAndJob(address _escrow, uint256 _jobId) external {
        escrow = _escrow;
        jobId = _jobId;
    }

    function setAcceptanceExpiryCallback(address _escrow, uint256 _jobId) external {
        escrow = _escrow;
        jobId = _jobId;
        reenterAcceptanceExpiry = true;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (reenterAcceptanceExpiry) {
            VeriqEscrow(escrow).claimAcceptanceExpiry(jobId);
        } else {
            VeriqEscrow(escrow).settle(jobId);
        }
        return true;
    }
}

contract FalseReturnToken is ITestToken {
    mapping(address => uint256) public balanceOf;
    address public failingRecipient;

    function setFailingRecipient(address recipient) external {
        failingRecipient = recipient;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (to == failingRecipient) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract VeriqEscrowTest is Test {
    MockUSDC usdc;
    VeriqEscrow escrow;

    event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, uint256 budget);
    event JobAccepted(uint256 indexed jobId, address indexed provider);
    event ResultCommitted(uint256 indexed jobId, address indexed provider);
    event JobScored(uint256 indexed jobId, uint256 qualityBps);
    event JobSettled(
        uint256 indexed jobId, uint256 qualityBps, uint256 payoutBps, uint256 providerPayment, uint256 clientRefund
    );
    event AcceptanceExpired(uint256 indexed jobId, uint256 clientRefund);
    event ProviderSubmissionDefaulted(uint256 indexed jobId, uint256 clientRefund);
    event ClientRevealDefaulted(uint256 indexed jobId, uint256 providerPayment);
    event ProviderHistoryUpdated(
        address indexed provider,
        uint256 measuredJobs,
        uint256 cumulativeQualityBps,
        uint256 completedJobs,
        uint256 submissionDefaults
    );

    address client = address(0x1);
    address provider = address(0x2);

    uint256 constant BUDGET = 10_000_000; // 10 USDC
    bytes32 constant TASK_HASH = keccak256("task-spec");
    bytes32 constant CANONICALIZATION_HASH = keccak256("canonicalization-v1");

    uint256[] metricPoints;
    uint256[] payoutBps;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new VeriqEscrow(address(usdc));

        metricPoints = new uint256[](3);
        metricPoints[0] = 7000;
        metricPoints[1] = 9000;
        metricPoints[2] = 9800;

        payoutBps = new uint256[](3);
        payoutBps[0] = 0;
        payoutBps[1] = 8000;
        payoutBps[2] = 10000;

        usdc.mint(client, 1_000_000_000);
    }

    function testConstructorRejectsZeroTokenAddress() public {
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ZeroTokenAddress.selector));
        new VeriqEscrow(address(0));
    }

    function testConstructorAcceptsValidToken() public {
        VeriqEscrow localEscrow = new VeriqEscrow(address(usdc));
        assertEq(address(localEscrow.escrowToken()), address(usdc));
    }

    function testCreateJobReturnsJobIdOneAndStoresData() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET);

        uint256 acceptanceDeadline = block.timestamp + 100;
        uint256 submissionDeadline = acceptanceDeadline + 100;
        uint256 revealDeadline = submissionDeadline + 100;

        vm.expectEmit(true, true, true, true);
        emit JobCreated(1, client, provider, BUDGET);

        uint256 jobId = escrow.createJob(
            provider,
            BUDGET,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            acceptanceDeadline,
            submissionDeadline,
            revealDeadline,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();

        assertEq(jobId, 1);

        (
            address storedClient,
            address storedProvider,
            uint256 storedBudget,
            bytes32 storedTaskHash,
            bytes32 storedExpectedCommitment,
            bytes32 storedCanonicalizationHash,
            uint256 storedAcceptanceDeadline,
            uint256 storedSubmissionDeadline,
            uint256 storedRevealDeadline,
            VeriqEscrow.JobStatus status
        ) = escrow.getJob(jobId);

        assertEq(storedClient, client);
        assertEq(storedProvider, provider);
        assertEq(storedBudget, BUDGET);
        assertEq(storedTaskHash, TASK_HASH);
        assertEq(storedExpectedCommitment, keccak256(abi.encode(buildAnswerArray(50, "expected"))));
        assertEq(storedCanonicalizationHash, CANONICALIZATION_HASH);
        assertEq(storedAcceptanceDeadline, acceptanceDeadline);
        assertEq(storedSubmissionDeadline, submissionDeadline);
        assertEq(storedRevealDeadline, revealDeadline);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.Funded));

        assertEq(escrow.getMetricPoints(jobId).length, 3);
        assertEq(escrow.getPayoutBps(jobId).length, 3);
        assertEq(escrow.getMetricPoints(jobId)[0], 7000);
        assertEq(escrow.getPayoutBps(jobId)[1], 8000);

        assertEq(usdc.balanceOf(client), 1_000_000_000 - BUDGET);
        assertEq(usdc.balanceOf(address(escrow)), BUDGET);
    }

    function testCreateJobSecondJobIdIncrements() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET);
        uint256 acceptanceDeadline = block.timestamp + 100;
        uint256 submissionDeadline = acceptanceDeadline + 100;
        uint256 revealDeadline = submissionDeadline + 100;
        escrow.createJob(
            provider,
            BUDGET,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            acceptanceDeadline,
            submissionDeadline,
            revealDeadline,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();

        usdc.mint(client, BUDGET);
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET);

        bytes32 expectedCommitment = keccak256(abi.encode(buildAnswerArray(50, "expected")));

        uint256 jobId2 = escrow.createJob(
            provider,
            BUDGET,
            TASK_HASH,
            expectedCommitment,
            CANONICALIZATION_HASH,
            acceptanceDeadline,
            submissionDeadline,
            revealDeadline,
            metricPoints,
            payoutBps
        );

        assertEq(jobId2, 2);
    }

    function testCreateJobRejectsZeroProvider() public {
        vm.prank(client);
        usdc.approve(address(escrow), BUDGET);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ZeroProvider.selector));
        escrow.createJob(
            address(0),
            BUDGET,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            block.timestamp + 100,
            block.timestamp + 200,
            block.timestamp + 300,
            metricPoints,
            payoutBps
        );
    }

    function testCreateJobRejectsProviderEqualToClient() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ProviderIsClient.selector));
        escrow.createJob(
            client,
            BUDGET,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            block.timestamp + 100,
            block.timestamp + 200,
            block.timestamp + 300,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
    }

    function testCreateJobRejectsZeroBudget() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ZeroBudget.selector));
        escrow.createJob(
            provider,
            0,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            block.timestamp + 100,
            block.timestamp + 200,
            block.timestamp + 300,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
    }

    function testCreateJobRejectsZeroTaskHash() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ZeroTaskSpecHash.selector));
        escrow.createJob(
            provider,
            BUDGET,
            bytes32(0),
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            block.timestamp + 100,
            block.timestamp + 200,
            block.timestamp + 300,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
    }

    function testCreateJobRejectsZeroExpectedCommitment() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ZeroExpectedAnswerCommitment.selector));
        escrow.createJob(
            provider,
            BUDGET,
            TASK_HASH,
            bytes32(0),
            CANONICALIZATION_HASH,
            block.timestamp + 100,
            block.timestamp + 200,
            block.timestamp + 300,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
    }

    function testCreateJobRejectsZeroCanonicalizationHash() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ZeroCanonicalizationVersionHash.selector));
        escrow.createJob(
            provider,
            BUDGET,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            bytes32(0),
            block.timestamp + 100,
            block.timestamp + 200,
            block.timestamp + 300,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
    }

    function testCreateJobRejectsAcceptanceDeadlineNotInFuture() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.AcceptanceDeadlineNotInFuture.selector));
        escrow.createJob(
            provider,
            BUDGET,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            block.timestamp,
            block.timestamp + 100,
            block.timestamp + 200,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
    }

    function testCreateJobRejectsSubmissionDeadlineNotAfterAcceptance() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.SubmissionDeadlineNotAfterAcceptance.selector));
        escrow.createJob(
            provider,
            BUDGET,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            block.timestamp + 200,
            block.timestamp + 100,
            block.timestamp + 300,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
    }

    function testCreateJobRejectsRevealDeadlineNotAfterSubmission() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.RevealDeadlineNotAfterSubmission.selector));
        escrow.createJob(
            provider,
            BUDGET,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            block.timestamp + 100,
            block.timestamp + 200,
            block.timestamp + 150,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
    }

    function testCreateJobRejectsInvalidCurve() public {
        uint256[] memory invalidMetrics = new uint256[](3);
        invalidMetrics[0] = 7000;
        invalidMetrics[1] = 9000;
        invalidMetrics[2] = 9000;

        uint256[] memory invalidPayouts = new uint256[](3);
        invalidPayouts[0] = 0;
        invalidPayouts[1] = 8000;
        invalidPayouts[2] = 10000;

        vm.prank(client);
        usdc.approve(address(escrow), BUDGET);
        vm.expectRevert();
        escrow.createJob(
            provider,
            BUDGET,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            block.timestamp + 100,
            block.timestamp + 200,
            block.timestamp + 300,
            invalidMetrics,
            invalidPayouts
        );
    }

    function testCreateJobRejectsInsufficientAllowance() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET - 1);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.TokenTransferFailed.selector));
        escrow.createJob(
            provider,
            BUDGET,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            block.timestamp + 100,
            block.timestamp + 200,
            block.timestamp + 300,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
    }

    function testCreateJobRejectsInsufficientBalance() public {
        address unfundedClient = address(0x3);
        vm.startPrank(unfundedClient);
        usdc.approve(address(escrow), BUDGET);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.TokenTransferFailed.selector));
        escrow.createJob(
            provider,
            BUDGET,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            block.timestamp + 100,
            block.timestamp + 200,
            block.timestamp + 300,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.nextJobId(), 1);
    }

    function testCreateJobFailureDoesNotConsumeJobIdOrStoreFundedJob() public {
        vm.prank(client);
        usdc.approve(address(escrow), BUDGET - 1);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.TokenTransferFailed.selector));
        escrow.createJob(
            provider,
            BUDGET,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            block.timestamp + 100,
            block.timestamp + 200,
            block.timestamp + 300,
            metricPoints,
            payoutBps
        );

        assertEq(escrow.nextJobId(), 1);
        (,,,,,,,,, VeriqEscrow.JobStatus status) = escrow.getJob(1);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.None));
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testProviderCanAcceptJob() public {
        uint256 jobId = createFundedJob();

        vm.expectEmit(true, true, false, true);
        emit JobAccepted(jobId, provider);

        vm.prank(provider);
        escrow.acceptJob(jobId);

        (,,,,,,,,, VeriqEscrow.JobStatus status) = escrow.getJob(jobId);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.Accepted));
    }

    function testNonProviderCannotAcceptJob() public {
        uint256 jobId = createFundedJob();

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.NotJobProvider.selector));
        escrow.acceptJob(jobId);
    }

    function testAcceptJobRejectsExpiredDeadline() public {
        uint256 jobId = createFundedJob();

        vm.warp(block.timestamp + 101);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.AcceptanceDeadlineExpired.selector));
        escrow.acceptJob(jobId);
    }

    function testAcceptJobRejectsSecondAcceptance() public {
        uint256 jobId = createFundedJob();

        vm.prank(provider);
        escrow.acceptJob(jobId);

        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.JobAlreadyAccepted.selector));
        escrow.acceptJob(jobId);
    }

    function testAcceptJobRejectsNonexistentJob() public {
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.acceptJob(999);
    }

    function testProviderCanSubmitResultCommitment() public {
        uint256 jobId = createAcceptedJob();
        bytes32 commitment = keccak256("result-commitment");

        vm.expectEmit(true, true, false, true);
        emit ResultCommitted(jobId, provider);

        vm.prank(provider);
        escrow.submitResultCommitment(jobId, commitment);

        assertEq(escrow.getResultCommitment(jobId), commitment);
        (,,,,,,,,, VeriqEscrow.JobStatus status) = escrow.getJob(jobId);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.Submitted));
    }

    function testResultCommitmentIsZeroBeforeSubmission() public {
        uint256 jobId = createAcceptedJob();
        assertEq(escrow.getResultCommitment(jobId), bytes32(0));
    }

    function testSubmitResultCommitmentRejectsZeroCommitment() public {
        uint256 jobId = createAcceptedJob();

        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ZeroResultCommitment.selector));
        escrow.submitResultCommitment(jobId, bytes32(0));
    }

    function testSubmitResultCommitmentRejectsNonProvider() public {
        uint256 jobId = createAcceptedJob();

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.NotJobProvider.selector));
        escrow.submitResultCommitment(jobId, keccak256("result-commitment"));
    }

    function testSubmitResultCommitmentRejectsDuplicateSubmission() public {
        uint256 jobId = createAcceptedJob();
        bytes32 commitment = keccak256("result-commitment");

        vm.prank(provider);
        escrow.submitResultCommitment(jobId, commitment);

        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.submitResultCommitment(jobId, keccak256("result-commitment-2"));
    }

    function testSubmitResultCommitmentRejectsExpiredDeadline() public {
        uint256 jobId = createAcceptedJob();

        vm.warp(block.timestamp + 201);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.SubmissionDeadlineExpired.selector));
        escrow.submitResultCommitment(jobId, keccak256("result-commitment"));
    }

    function testSubmitResultCommitmentRejectsBeforeAcceptance() public {
        uint256 jobId = createFundedJob();

        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.submitResultCommitment(jobId, keccak256("result-commitment"));
    }

    function testSubmitResultCommitmentRejectsNonexistentJob() public {
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.NotJobProvider.selector));
        escrow.submitResultCommitment(999, keccak256("result-commitment"));
    }

    function testClientCanRevealAndScoreValidAnswers() public {
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        bytes32[] memory providerAnswers = buildAnswerArray(50, "provider");
        for (uint256 i = 0; i < 46; i++) {
            providerAnswers[i] = expectedAnswers[i];
        }
        uint256 jobId = createSubmittedJobWithProviderAnswers(providerAnswers);

        vm.expectEmit(true, true, false, true);
        emit JobScored(jobId, 9_200);

        uint256 escrowBalanceBefore = usdc.balanceOf(address(escrow));
        uint256 clientBalanceBefore = usdc.balanceOf(client);
        uint256 providerBalanceBefore = usdc.balanceOf(provider);

        vm.prank(client);
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);

        uint256 escrowBalanceAfter = usdc.balanceOf(address(escrow));
        uint256 clientBalanceAfter = usdc.balanceOf(client);
        uint256 providerBalanceAfter = usdc.balanceOf(provider);

        (,,,,,,,,, VeriqEscrow.JobStatus status) = escrow.getJob(jobId);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.Scored));
        assertEq(escrow.getQualityBps(jobId), 9_200);
        assertEq(uint256(escrow.getStatus(jobId)), uint256(VeriqEscrow.JobStatus.Scored));
        assertEq(escrowBalanceAfter, escrowBalanceBefore);
        assertEq(clientBalanceAfter, clientBalanceBefore);
        assertEq(providerBalanceAfter, providerBalanceBefore);
        assertEq(escrowBalanceBefore, BUDGET);
    }

    function testRevealAndScoreStores10000ForPerfectMatch() public {
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");
        uint256 jobId = createSubmittedJobWithProviderAnswers(providerAnswers);
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");

        vm.prank(client);
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);

        assertEq(escrow.getQualityBps(jobId), 10_000);
    }

    function testRevealAndScoreStoresZeroForNoMatch() public {
        bytes32[] memory providerAnswers = buildAnswerArray(50, "provider");
        uint256 jobId = createSubmittedJobWithProviderAnswers(providerAnswers);
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");

        vm.prank(client);
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);

        assertEq(escrow.getQualityBps(jobId), 0);
    }

    function testRevealAndScoreRejectsNonClientCaller() public {
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");
        uint256 jobId = createSubmittedJobWithProviderAnswers(providerAnswers);
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");

        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.UnauthorizedCaller.selector));
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function testRevealAndScoreRejectsBeforeProviderSubmission() public {
        uint256 jobId = createAcceptedJob();
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function testRevealAndScoreRejectsSecondAttempt() public {
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");
        uint256 jobId = createSubmittedJobWithProviderAnswers(providerAnswers);
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");

        vm.prank(client);
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function testRevealAndScoreRejectsNonexistentJob() public {
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.NonexistentJob.selector));
        escrow.revealAndScore(999, expectedAnswers, providerAnswers);
    }

    function testRevealAndScoreRejectsAfterDeadline() public {
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");
        uint256 jobId = createSubmittedJobWithProviderAnswers(providerAnswers);
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");

        vm.warp(block.timestamp + 301);

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.RevealDeadlineExpired.selector));
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function testRevealAndScoreRejectsArrayBelow50Elements() public {
        uint256 jobId = createSubmittedJob();
        bytes32[] memory expectedAnswers = new bytes32[](49);
        bytes32[] memory providerAnswers = new bytes32[](49);

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidAnswerCount.selector));
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function testRevealAndScoreRejectsArrayAbove50Elements() public {
        uint256 jobId = createSubmittedJob();
        bytes32[] memory expectedAnswers = new bytes32[](51);
        bytes32[] memory providerAnswers = new bytes32[](51);

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidAnswerCount.selector));
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function testRevealAndScoreRejectsModifiedExpectedAnswer() public {
        uint256 jobId = createSubmittedJob();
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");
        expectedAnswers[0] = keccak256("tampered");

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ExpectedCommitmentMismatch.selector));
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function testRevealAndScoreRejectsReorderedExpectedAnswers() public {
        uint256 jobId = createSubmittedJob();
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");
        (expectedAnswers[0], expectedAnswers[1]) = (expectedAnswers[1], expectedAnswers[0]);

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ExpectedCommitmentMismatch.selector));
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function testRevealAndScoreRejectsModifiedProviderAnswer() public {
        uint256 jobId = createSubmittedJob();
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");
        providerAnswers[0] = keccak256("tampered");

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ProviderCommitmentMismatch.selector));
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function testRevealAndScoreRejectsReorderedProviderAnswers() public {
        uint256 jobId = createSubmittedJob();
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");
        (providerAnswers[0], providerAnswers[1]) = (providerAnswers[1], providerAnswers[0]);

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ProviderCommitmentMismatch.selector));
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function testRevealAndScoreRejectsPackedEncodingCommitment() public {
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");
        uint256 jobId = createAcceptedJob();
        bytes32 providerCommitment = keccak256(abi.encodePacked(providerAnswers));
        vm.prank(provider);
        escrow.submitResultCommitment(jobId, providerCommitment);
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ProviderCommitmentMismatch.selector));
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function testRevealAndScoreRejectsUnrelatedArrays() public {
        bytes32[] memory providerAnswers = buildAnswerArray(50, "provider");
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        uint256 jobId = createSubmittedJobWithExpectedCommitmentAndProviderAnswers(
            keccak256(abi.encode(buildAnswerArray(50, "different"))), providerAnswers
        );

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ExpectedCommitmentMismatch.selector));
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function testSuccessfulSettlementForDemoCase() public {
        uint256 budget = 200_000_000;
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        bytes32[] memory providerAnswers = buildAnswerArray(50, "provider");
        for (uint256 i = 0; i < 46; i++) {
            providerAnswers[i] = expectedAnswers[i];
        }

        uint256 jobId = createScoredJobWithBudgetAndProviderAnswers(budget, providerAnswers);
        uint256 clientBalanceBeforeSettlement = usdc.balanceOf(client);

        vm.expectEmit(true, true, true, true);
        emit JobSettled(jobId, 9_200, 8_500, 170_000_000, 30_000_000);

        vm.prank(client);
        escrow.settle(jobId);

        (,,,,,,,,, VeriqEscrow.JobStatus status) = escrow.getJob(jobId);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.Settled));
        assertEq(escrow.getQualityBps(jobId), 9_200);

        (
            uint256 storedQualityBps,
            uint256 storedPayoutBps,
            uint256 storedProviderPayment,
            uint256 storedClientRefund,
            VeriqEscrow.JobStatus settlementStatus
        ) = escrow.getSettlementResult(jobId);
        assertEq(storedQualityBps, 9_200);
        assertEq(storedPayoutBps, 8_500);
        assertEq(storedProviderPayment, 170_000_000);
        assertEq(storedClientRefund, 30_000_000);
        assertEq(uint256(settlementStatus), uint256(VeriqEscrow.JobStatus.Settled));
        assertEq(usdc.balanceOf(provider), 170_000_000);
        assertEq(usdc.balanceOf(client) - clientBalanceBeforeSettlement, 30_000_000);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testSettlementUsesZeroPayoutFor7000Quality() public {
        bytes32[] memory providerAnswers = buildProviderAnswersWithMatches(35);
        uint256 jobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, providerAnswers);
        vm.prank(client);
        escrow.settle(jobId);

        (, uint256 storedPayoutBps, uint256 storedProviderPayment, uint256 storedClientRefund,) =
            escrow.getSettlementResult(jobId);
        assertEq(storedPayoutBps, 0);
        assertEq(storedProviderPayment, 0);
        assertEq(storedClientRefund, BUDGET);
    }

    function testSettlementUses80PercentPayoutFor9000Quality() public {
        bytes32[] memory providerAnswers = buildProviderAnswersWithMatches(45);
        uint256 jobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, providerAnswers);
        vm.prank(client);
        escrow.settle(jobId);

        (, uint256 storedPayoutBps, uint256 storedProviderPayment, uint256 storedClientRefund,) =
            escrow.getSettlementResult(jobId);
        assertEq(storedPayoutBps, 8_000);
        assertEq(storedProviderPayment, 8_000_000);
        assertEq(storedClientRefund, 2_000_000);
    }

    function testSettlementUsesFullPayoutFor9800Quality() public {
        bytes32[] memory providerAnswers = buildProviderAnswersWithMatches(49);
        uint256 jobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, providerAnswers);
        vm.prank(client);
        escrow.settle(jobId);

        (, uint256 storedPayoutBps, uint256 storedProviderPayment, uint256 storedClientRefund,) =
            escrow.getSettlementResult(jobId);
        assertEq(storedPayoutBps, 10_000);
        assertEq(storedProviderPayment, BUDGET);
        assertEq(storedClientRefund, 0);
    }

    function testSettlementUsesFullPayoutAbove9800Quality() public {
        bytes32[] memory providerAnswers = buildProviderAnswersWithMatches(50);
        uint256 jobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, providerAnswers);
        vm.prank(client);
        escrow.settle(jobId);

        (, uint256 storedPayoutBps, uint256 storedProviderPayment, uint256 storedClientRefund,) =
            escrow.getSettlementResult(jobId);
        assertEq(storedPayoutBps, 10_000);
        assertEq(storedProviderPayment, BUDGET);
        assertEq(storedClientRefund, 0);
    }

    function testSettlementUsesZeroPayoutBelow7000Quality() public {
        bytes32[] memory providerAnswers = buildProviderAnswersWithMatches(34);
        uint256 jobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, providerAnswers);
        vm.prank(client);
        escrow.settle(jobId);

        (, uint256 storedPayoutBps, uint256 storedProviderPayment, uint256 storedClientRefund,) =
            escrow.getSettlementResult(jobId);
        assertEq(storedPayoutBps, 0);
        assertEq(storedProviderPayment, 0);
        assertEq(storedClientRefund, BUDGET);
    }

    function testSettlementRoundsDownInterpolatedPayout() public {
        uint256 budget = 200_000_000;
        bytes32[] memory providerAnswers = buildProviderAnswersWithMatches(46);
        uint256 jobId = createScoredJobWithBudgetAndProviderAnswers(budget, providerAnswers);
        vm.prank(client);
        escrow.settle(jobId);

        (, uint256 storedPayoutBps, uint256 storedProviderPayment, uint256 storedClientRefund,) =
            escrow.getSettlementResult(jobId);
        assertEq(storedPayoutBps, 8_500);
        assertEq(storedProviderPayment, 170_000_000);
        assertEq(storedClientRefund, 30_000_000);
    }

    function testSettlementRejectsNonexistentJob() public {
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.NonexistentJob.selector));
        escrow.settle(999);
    }

    function testSettlementRejectsFundedJob() public {
        uint256 jobId = createFundedJob();
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.settle(jobId);
    }

    function testSettlementRejectsAcceptedJob() public {
        uint256 jobId = createAcceptedJob();
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.settle(jobId);
    }

    function testSettlementRejectsSubmittedJob() public {
        uint256 jobId = createSubmittedJob();
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.settle(jobId);
    }

    function testSettlementRejectsSecondSettlement() public {
        uint256 jobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, buildAnswerArray(50, "expected"));
        vm.prank(client);
        escrow.settle(jobId);

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.settle(jobId);
    }

    function testRevealAndScoreRejectsAfterSettlement() public {
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");
        uint256 jobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, providerAnswers);
        vm.prank(client);
        escrow.settle(jobId);

        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function testSettlementKeepsAccountingBalanced() public {
        uint256 jobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, buildAnswerArray(50, "expected"));
        vm.prank(client);
        escrow.settle(jobId);

        (,, uint256 providerPayment, uint256 clientRefund,) = escrow.getSettlementResult(jobId);
        assertEq(providerPayment + clientRefund, BUDGET);
        assertLe(providerPayment, BUDGET);
        assertLe(clientRefund, BUDGET);
    }

    function testSettlementRevertsOnProviderTransferFailure() public {
        FalseReturnToken token = new FalseReturnToken();
        token.mint(client, BUDGET);
        vm.prank(client);
        VeriqEscrow localEscrow = new VeriqEscrow(address(token));
        vm.prank(client);
        token.approve(address(localEscrow), BUDGET);

        uint256 jobId = createJobWithToken(localEscrow, address(token), BUDGET);
        vm.prank(provider);
        localEscrow.acceptJob(jobId);
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");
        vm.prank(provider);
        localEscrow.submitResultCommitment(jobId, keccak256(abi.encode(providerAnswers)));
        vm.prank(client);
        localEscrow.revealAndScore(jobId, expectedAnswers, providerAnswers);

        token.setFailingRecipient(provider);
        uint256 clientBalanceBefore = token.balanceOf(client);
        uint256 providerBalanceBefore = token.balanceOf(provider);
        uint256 escrowBalanceBefore = token.balanceOf(address(localEscrow));

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.TokenTransferFailed.selector));
        localEscrow.settle(jobId);

        (,,,, VeriqEscrow.JobStatus status) = localEscrow.getSettlementResult(jobId);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.Scored));
        assertEq(token.balanceOf(client), clientBalanceBefore);
        assertEq(token.balanceOf(provider), providerBalanceBefore);
        assertEq(token.balanceOf(address(localEscrow)), escrowBalanceBefore);
        assertProviderHistory(localEscrow, provider, 0, 0, 0, 0, 0);
    }

    function testSettlementRevertsOnClientRefundFailure() public {
        FalseReturnToken token = new FalseReturnToken();
        token.mint(client, BUDGET);
        VeriqEscrow localEscrow = new VeriqEscrow(address(token));

        uint256 jobId = createJobWithToken(localEscrow, address(token), BUDGET);
        vm.prank(provider);
        localEscrow.acceptJob(jobId);

        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        bytes32[] memory providerAnswers = buildProviderAnswersWithMatches(46);
        vm.prank(provider);
        localEscrow.submitResultCommitment(jobId, keccak256(abi.encode(providerAnswers)));
        vm.prank(client);
        localEscrow.revealAndScore(jobId, expectedAnswers, providerAnswers);

        token.setFailingRecipient(client);
        uint256 clientBalanceBefore = token.balanceOf(client);
        uint256 providerBalanceBefore = token.balanceOf(provider);
        uint256 escrowBalanceBefore = token.balanceOf(address(localEscrow));

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.TokenTransferFailed.selector));
        localEscrow.settle(jobId);

        (
            uint256 qualityBps,
            uint256 storedPayoutBps,
            uint256 providerPayment,
            uint256 clientRefund,
            VeriqEscrow.JobStatus status
        ) = localEscrow.getSettlementResult(jobId);
        assertEq(qualityBps, 9_200);
        assertEq(storedPayoutBps, 0);
        assertEq(providerPayment, 0);
        assertEq(clientRefund, 0);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.Scored));
        assertEq(token.balanceOf(client), clientBalanceBefore);
        assertEq(token.balanceOf(provider), providerBalanceBefore);
        assertEq(token.balanceOf(address(localEscrow)), escrowBalanceBefore);
        assertProviderHistory(localEscrow, provider, 0, 0, 0, 0, 0);
    }

    function testSettlementRevertsOnReentrantTransfer() public {
        RevertingTransferToken token = new RevertingTransferToken();
        token.mint(client, BUDGET);
        VeriqEscrow localEscrow = new VeriqEscrow(address(token));
        vm.prank(client);
        token.approve(address(localEscrow), BUDGET);

        uint256 jobId = createJobWithToken(localEscrow, address(token), BUDGET);
        vm.prank(provider);
        localEscrow.acceptJob(jobId);
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        bytes32[] memory providerAnswers = buildAnswerArray(50, "expected");
        vm.prank(provider);
        localEscrow.submitResultCommitment(jobId, keccak256(abi.encode(providerAnswers)));
        vm.prank(client);
        localEscrow.revealAndScore(jobId, expectedAnswers, providerAnswers);

        token.setEscrowAndJob(address(localEscrow), jobId);
        uint256 clientBalanceBefore = token.balanceOf(client);
        uint256 providerBalanceBefore = token.balanceOf(provider);
        uint256 escrowBalanceBefore = token.balanceOf(address(localEscrow));

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ReentrancyGuard.selector));
        localEscrow.settle(jobId);

        (,,,, VeriqEscrow.JobStatus status) = localEscrow.getSettlementResult(jobId);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.Scored));
        assertEq(token.balanceOf(client), clientBalanceBefore);
        assertEq(token.balanceOf(provider), providerBalanceBefore);
        assertEq(token.balanceOf(address(localEscrow)), escrowBalanceBefore);
        assertProviderHistory(localEscrow, provider, 0, 0, 0, 0, 0);
    }

    function testProviderHistoryInitialStateAndZeroAverage() public view {
        assertProviderHistory(escrow, provider, 0, 0, 0, 0, 0);
    }

    function testProviderHistoryOne9200SettlementUpdatesMeasuredAndCompletedCounters() public {
        uint256 jobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, buildProviderAnswersWithMatches(46));

        vm.expectEmit(true, false, false, true);
        emit ProviderHistoryUpdated(provider, 1, 9_200, 1, 0);
        escrow.settle(jobId);

        assertProviderHistory(escrow, provider, 1, 9_200, 9_200, 1, 0);

        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.settle(jobId);
        assertProviderHistory(escrow, provider, 1, 9_200, 9_200, 1, 0);
    }

    function testProviderHistoryTwoMeasuredSettlementsAccumulateAndAverage() public {
        uint256 firstJobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, buildProviderAnswersWithMatches(46));
        escrow.settle(firstJobId);
        uint256 secondJobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, buildProviderAnswersWithMatches(45));
        escrow.settle(secondJobId);

        assertProviderHistory(escrow, provider, 2, 18_200, 9_100, 2, 0);
    }

    function testProviderHistoriesAreIndependent() public {
        address secondProvider = address(0xCAFE);
        uint256 firstJobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, buildProviderAnswersWithMatches(46));
        escrow.settle(firstJobId);
        uint256 secondJobId = createScoredJobForProvider(secondProvider, buildProviderAnswersWithMatches(50));
        escrow.settle(secondJobId);

        assertProviderHistory(escrow, provider, 1, 9_200, 9_200, 1, 0);
        assertProviderHistory(escrow, secondProvider, 1, 10_000, 10_000, 1, 0);
    }

    function testClientRevealDefaultIncrementsCompletedJobsOnly() public {
        uint256 jobId = createSubmittedJob();
        vm.warp(revealDeadlineOf(jobId) + 1);

        vm.expectEmit(true, false, false, true);
        emit ProviderHistoryUpdated(provider, 0, 0, 1, 0);
        escrow.claimClientRevealDefault(jobId);

        assertProviderHistory(escrow, provider, 0, 0, 0, 1, 0);
    }

    function testProviderSubmissionDefaultIncrementsSubmissionDefaultsOnlyOnce() public {
        uint256 jobId = createAcceptedJob();
        vm.warp(submissionDeadlineOf(jobId) + 1);

        vm.expectEmit(true, false, false, true);
        emit ProviderHistoryUpdated(provider, 0, 0, 0, 1);
        escrow.claimProviderSubmissionDefault(jobId);
        assertProviderHistory(escrow, provider, 0, 0, 0, 0, 1);

        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.claimProviderSubmissionDefault(jobId);
        assertProviderHistory(escrow, provider, 0, 0, 0, 0, 1);
    }

    function testAcceptanceExpiryLeavesProviderHistoryUnchanged() public {
        uint256 jobId = createFundedJob();
        vm.warp(acceptanceDeadlineOf(jobId) + 1);
        escrow.claimAcceptanceExpiry(jobId);
        assertProviderHistory(escrow, provider, 0, 0, 0, 0, 0);
    }

    function testOnlyNormalSettlementsAffectMeasuredAverage() public {
        uint256 submissionDefaultJob = createAcceptedJob();
        vm.warp(submissionDeadlineOf(submissionDefaultJob) + 1);
        escrow.claimProviderSubmissionDefault(submissionDefaultJob);

        uint256 clientDefaultJob = createSubmittedJob();
        vm.warp(revealDeadlineOf(clientDefaultJob) + 1);
        escrow.claimClientRevealDefault(clientDefaultJob);

        uint256 measuredJob = createScoredJobWithBudgetAndProviderAnswers(BUDGET, buildProviderAnswersWithMatches(46));
        escrow.settle(measuredJob);

        assertProviderHistory(escrow, provider, 1, 9_200, 9_200, 2, 1);
    }

    function testZeroQualityIsMeasuredAndPerfectQualityIsRecorded() public {
        uint256 zeroQualityJob = createScoredJobWithBudgetAndProviderAnswers(BUDGET, buildProviderAnswersWithMatches(0));
        escrow.settle(zeroQualityJob);
        assertProviderHistory(escrow, provider, 1, 0, 0, 1, 0);

        uint256 perfectJob = createScoredJobWithBudgetAndProviderAnswers(BUDGET, buildProviderAnswersWithMatches(50));
        escrow.settle(perfectJob);
        assertProviderHistory(escrow, provider, 2, 10_000, 5_000, 2, 0);
    }

    function testCompletedJobsCanExceedMeasuredJobs() public {
        uint256 measuredJob = createScoredJobWithBudgetAndProviderAnswers(BUDGET, buildProviderAnswersWithMatches(46));
        escrow.settle(measuredJob);
        uint256 defaultJob = createSubmittedJob();
        vm.warp(revealDeadlineOf(defaultJob) + 1);
        escrow.claimClientRevealDefault(defaultJob);

        assertProviderHistory(escrow, provider, 1, 9_200, 9_200, 2, 0);
    }

    function testAcceptanceExpiryPermissionlessRefundsClientAndFinalizesAccounting() public {
        uint256 jobId = createFundedJob();
        uint256 callerBalanceBefore = usdc.balanceOf(address(0xBEEF));
        vm.warp(acceptanceDeadlineOf(jobId) + 1);

        vm.expectEmit(true, false, false, true);
        emit AcceptanceExpired(jobId, BUDGET);
        vm.prank(address(0xBEEF));
        escrow.claimAcceptanceExpiry(jobId);

        (address storedClient, address storedProvider, uint256 storedBudget,,,,,,, VeriqEscrow.JobStatus status) =
            escrow.getJob(jobId);
        (, uint256 storedPayoutBps, uint256 providerPayment, uint256 clientRefund,) = escrow.getSettlementResult(jobId);
        assertEq(storedClient, client);
        assertEq(storedProvider, provider);
        assertEq(storedBudget, BUDGET);
        assertEq(storedPayoutBps, 0);
        assertEq(providerPayment, 0);
        assertEq(clientRefund, BUDGET);
        assertEq(providerPayment + clientRefund, BUDGET);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.AcceptanceExpired));
        assertEq(usdc.balanceOf(client), 1_000_000_000);
        assertEq(usdc.balanceOf(provider), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(address(0xBEEF)), callerBalanceBefore);
    }

    function testAcceptanceExpiryBeforeDeadlineReverts() public {
        uint256 jobId = createFundedJob();
        vm.warp(acceptanceDeadlineOf(jobId) - 1);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.DeadlineNotPassed.selector));
        escrow.claimAcceptanceExpiry(jobId);
    }

    function testAcceptanceExpiryExactlyAtDeadlineReverts() public {
        uint256 jobId = createFundedJob();
        vm.warp(acceptanceDeadlineOf(jobId));
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.DeadlineNotPassed.selector));
        escrow.claimAcceptanceExpiry(jobId);
    }

    function testAcceptanceExpiryRejectsNonFundedNonexistentAndSecondClaim() public {
        uint256 acceptedJobId = createAcceptedJob();
        vm.warp(acceptanceDeadlineOf(acceptedJobId) + 1);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.claimAcceptanceExpiry(acceptedJobId);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.NonexistentJob.selector));
        escrow.claimAcceptanceExpiry(999);

        uint256 fundedJobId = createFundedJob();
        vm.warp(acceptanceDeadlineOf(fundedJobId) + 1);
        escrow.claimAcceptanceExpiry(fundedJobId);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.claimAcceptanceExpiry(fundedJobId);
    }

    function testAcceptanceExpiryFailedRefundRollsBackStateAndBalances() public {
        FalseReturnToken token = new FalseReturnToken();
        token.mint(client, BUDGET);
        VeriqEscrow localEscrow = new VeriqEscrow(address(token));
        uint256 jobId = createJobWithToken(localEscrow, address(token), BUDGET);
        token.setFailingRecipient(client);
        uint256 clientBefore = token.balanceOf(client);
        uint256 escrowBefore = token.balanceOf(address(localEscrow));
        vm.warp(localAcceptanceDeadlineOf(localEscrow, jobId) + 1);

        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.TokenTransferFailed.selector));
        localEscrow.claimAcceptanceExpiry(jobId);

        (,,,, VeriqEscrow.JobStatus status) = localEscrow.getSettlementResult(jobId);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.Funded));
        assertEq(token.balanceOf(client), clientBefore);
        assertEq(token.balanceOf(address(localEscrow)), escrowBefore);
    }

    function testProviderSubmissionDefaultPermissionlessRefundsClientAndLeavesQualityUnmeasured() public {
        uint256 jobId = createAcceptedJob();
        uint256 callerBalanceBefore = usdc.balanceOf(address(0xBEEF));
        vm.warp(submissionDeadlineOf(jobId) + 1);

        vm.expectEmit(true, false, false, true);
        emit ProviderSubmissionDefaulted(jobId, BUDGET);
        vm.prank(address(0xBEEF));
        escrow.claimProviderSubmissionDefault(jobId);

        (,, uint256 storedBudget,,,,,,, VeriqEscrow.JobStatus jobStatus) = escrow.getJob(jobId);
        (
            uint256 qualityBps,
            uint256 storedPayoutBps,
            uint256 providerPayment,
            uint256 clientRefund,
            VeriqEscrow.JobStatus status
        ) = escrow.getSettlementResult(jobId);
        assertEq(qualityBps, 0);
        assertEq(storedBudget, BUDGET);
        assertEq(storedPayoutBps, 0);
        assertEq(providerPayment, 0);
        assertEq(clientRefund, BUDGET);
        assertEq(providerPayment + clientRefund, BUDGET);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.ProviderSubmissionDefault));
        assertEq(uint256(jobStatus), uint256(VeriqEscrow.JobStatus.ProviderSubmissionDefault));
        assertEq(usdc.balanceOf(client), 1_000_000_000);
        assertEq(usdc.balanceOf(provider), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(address(0xBEEF)), callerBalanceBefore);
    }

    function testProviderSubmissionDefaultBeforeDeadlineReverts() public {
        uint256 jobId = createAcceptedJob();
        vm.warp(submissionDeadlineOf(jobId) - 1);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.DeadlineNotPassed.selector));
        escrow.claimProviderSubmissionDefault(jobId);
    }

    function testProviderSubmissionDefaultExactlyAtDeadlineReverts() public {
        uint256 jobId = createAcceptedJob();
        vm.warp(submissionDeadlineOf(jobId));
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.DeadlineNotPassed.selector));
        escrow.claimProviderSubmissionDefault(jobId);
    }

    function testProviderSubmissionDefaultRejectsFundedSubmittedNonexistentAndSecondClaim() public {
        uint256 fundedJobId = createFundedJob();
        vm.warp(submissionDeadlineOf(fundedJobId) + 1);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.claimProviderSubmissionDefault(fundedJobId);

        uint256 submittedJobId = createSubmittedJob();
        vm.warp(submissionDeadlineOf(submittedJobId) + 1);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.claimProviderSubmissionDefault(submittedJobId);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.NonexistentJob.selector));
        escrow.claimProviderSubmissionDefault(999);

        uint256 acceptedJobId = createAcceptedJob();
        vm.warp(submissionDeadlineOf(acceptedJobId) + 1);
        escrow.claimProviderSubmissionDefault(acceptedJobId);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.claimProviderSubmissionDefault(acceptedJobId);
    }

    function testProviderSubmissionDefaultFailedRefundRollsBackStateAndBalances() public {
        FalseReturnToken token = new FalseReturnToken();
        token.mint(client, BUDGET);
        VeriqEscrow localEscrow = new VeriqEscrow(address(token));
        uint256 jobId = createJobWithToken(localEscrow, address(token), BUDGET);
        vm.prank(provider);
        localEscrow.acceptJob(jobId);
        token.setFailingRecipient(client);
        uint256 clientBefore = token.balanceOf(client);
        uint256 escrowBefore = token.balanceOf(address(localEscrow));
        vm.warp(localSubmissionDeadlineOf(localEscrow, jobId) + 1);

        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.TokenTransferFailed.selector));
        localEscrow.claimProviderSubmissionDefault(jobId);

        (uint256 qualityBps,,,, VeriqEscrow.JobStatus status) = localEscrow.getSettlementResult(jobId);
        assertEq(qualityBps, 0);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.Accepted));
        assertEq(token.balanceOf(client), clientBefore);
        assertEq(token.balanceOf(address(localEscrow)), escrowBefore);
        assertProviderHistory(localEscrow, provider, 0, 0, 0, 0, 0);
    }

    function testClientRevealDefaultPermissionlessPaysProviderFullBudgetAndFinalizesAccounting() public {
        uint256 budget = 200_000_000;
        uint256 jobId = createSubmittedJobWithBudget(budget);
        uint256 callerBalanceBefore = usdc.balanceOf(address(0xBEEF));
        uint256 clientBalanceBefore = usdc.balanceOf(client);
        vm.warp(revealDeadlineOf(jobId) + 1);

        vm.expectEmit(true, false, false, true);
        emit ClientRevealDefaulted(jobId, budget);
        vm.prank(address(0xBEEF));
        escrow.claimClientRevealDefault(jobId);

        (,, uint256 storedBudget,,,,,,, VeriqEscrow.JobStatus jobStatus) = escrow.getJob(jobId);
        (
            uint256 qualityBps,
            uint256 storedPayoutBps,
            uint256 providerPayment,
            uint256 clientRefund,
            VeriqEscrow.JobStatus status
        ) = escrow.getSettlementResult(jobId);
        assertEq(qualityBps, 0);
        assertEq(storedBudget, budget);
        assertEq(storedPayoutBps, 10_000);
        assertEq(providerPayment, budget);
        assertEq(clientRefund, 0);
        assertEq(providerPayment + clientRefund, budget);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.ClientRevealDefault));
        assertEq(uint256(jobStatus), uint256(VeriqEscrow.JobStatus.ClientRevealDefault));
        assertEq(usdc.balanceOf(client), clientBalanceBefore);
        assertEq(usdc.balanceOf(provider), 200_000_000);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(address(0xBEEF)), callerBalanceBefore);
    }

    function testClientRevealDefaultBeforeDeadlineReverts() public {
        uint256 jobId = createSubmittedJob();
        vm.warp(revealDeadlineOf(jobId) - 1);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.DeadlineNotPassed.selector));
        escrow.claimClientRevealDefault(jobId);
    }

    function testClientRevealDefaultExactlyAtDeadlineReverts() public {
        uint256 jobId = createSubmittedJob();
        vm.warp(revealDeadlineOf(jobId));
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.DeadlineNotPassed.selector));
        escrow.claimClientRevealDefault(jobId);
    }

    function testClientRevealDefaultRejectsFundedAcceptedScoredNonexistentAndSecondClaim() public {
        uint256 fundedJobId = createFundedJob();
        vm.warp(revealDeadlineOf(fundedJobId) + 1);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.claimClientRevealDefault(fundedJobId);

        uint256 acceptedJobId = createAcceptedJob();
        vm.warp(revealDeadlineOf(acceptedJobId) + 1);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.claimClientRevealDefault(acceptedJobId);

        uint256 scoredJobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, buildAnswerArray(50, "expected"));
        vm.warp(revealDeadlineOf(scoredJobId) + 1);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.claimClientRevealDefault(scoredJobId);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.NonexistentJob.selector));
        escrow.claimClientRevealDefault(999);

        uint256 submittedJobId = createSubmittedJob();
        vm.warp(revealDeadlineOf(submittedJobId) + 1);
        escrow.claimClientRevealDefault(submittedJobId);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.claimClientRevealDefault(submittedJobId);
    }

    function testClientRevealDefaultFailedProviderTransferRollsBackStateAndBalances() public {
        FalseReturnToken token = new FalseReturnToken();
        token.mint(client, BUDGET);
        VeriqEscrow localEscrow = new VeriqEscrow(address(token));
        uint256 jobId = createSubmittedJobWithToken(localEscrow, address(token), BUDGET);
        token.setFailingRecipient(provider);
        uint256 providerBefore = token.balanceOf(provider);
        uint256 escrowBefore = token.balanceOf(address(localEscrow));
        vm.warp(localRevealDeadlineOf(localEscrow, jobId) + 1);

        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.TokenTransferFailed.selector));
        localEscrow.claimClientRevealDefault(jobId);

        (uint256 qualityBps,,,, VeriqEscrow.JobStatus status) = localEscrow.getSettlementResult(jobId);
        assertEq(qualityBps, 0);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.Submitted));
        assertEq(token.balanceOf(provider), providerBefore);
        assertEq(token.balanceOf(address(localEscrow)), escrowBefore);
        assertProviderHistory(localEscrow, provider, 0, 0, 0, 0, 0);
    }

    function testDefaultedJobsCannotLaterBeScoredOrSettled() public {
        bytes32[] memory answers = buildAnswerArray(50, "expected");
        uint256 jobId = createSubmittedJobWithProviderAnswers(answers);
        vm.warp(revealDeadlineOf(jobId) + 1);
        escrow.claimClientRevealDefault(jobId);

        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.revealAndScore(jobId, answers, answers);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.settle(jobId);
    }

    function testSettledJobCannotEnterAnyDefaultPath() public {
        uint256 jobId = createScoredJobWithBudgetAndProviderAnswers(BUDGET, buildAnswerArray(50, "expected"));
        escrow.settle(jobId);
        vm.warp(revealDeadlineOf(jobId) + 1);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.claimAcceptanceExpiry(jobId);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.claimProviderSubmissionDefault(jobId);
        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.InvalidJobState.selector));
        escrow.claimClientRevealDefault(jobId);
    }

    function testAcceptanceExpiryReentrantCallbackRevertsAndRollsBack() public {
        RevertingTransferToken token = new RevertingTransferToken();
        token.mint(client, BUDGET);
        VeriqEscrow localEscrow = new VeriqEscrow(address(token));
        uint256 jobId = createJobWithToken(localEscrow, address(token), BUDGET);
        token.setAcceptanceExpiryCallback(address(localEscrow), jobId);
        uint256 clientBefore = token.balanceOf(client);
        uint256 escrowBefore = token.balanceOf(address(localEscrow));
        vm.warp(localAcceptanceDeadlineOf(localEscrow, jobId) + 1);

        vm.expectRevert(abi.encodeWithSelector(VeriqEscrow.ReentrancyGuard.selector));
        localEscrow.claimAcceptanceExpiry(jobId);

        (,,,, VeriqEscrow.JobStatus status) = localEscrow.getSettlementResult(jobId);
        assertEq(uint256(status), uint256(VeriqEscrow.JobStatus.Funded));
        assertEq(token.balanceOf(client), clientBefore);
        assertEq(token.balanceOf(address(localEscrow)), escrowBefore);
        assertProviderHistory(localEscrow, provider, 0, 0, 0, 0, 0);
    }

    function createFundedJob() internal returns (uint256 jobId) {
        return createFundedJobWithExpectedCommitment(keccak256(abi.encode(buildAnswerArray(50, "expected"))));
    }

    function createFundedJobWithBudgetAndExpectedCommitment(uint256 budget, bytes32 expectedCommitment)
        internal
        returns (uint256 jobId)
    {
        vm.startPrank(client);
        usdc.approve(address(escrow), budget);

        uint256 acceptanceDeadline = block.timestamp + 100;
        uint256 submissionDeadline = acceptanceDeadline + 100;
        uint256 revealDeadline = submissionDeadline + 100;

        jobId = escrow.createJob(
            provider,
            budget,
            TASK_HASH,
            expectedCommitment,
            CANONICALIZATION_HASH,
            acceptanceDeadline,
            submissionDeadline,
            revealDeadline,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
    }

    function createFundedJobWithExpectedCommitment(bytes32 expectedCommitment) internal returns (uint256 jobId) {
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET);

        uint256 acceptanceDeadline = block.timestamp + 100;
        uint256 submissionDeadline = acceptanceDeadline + 100;
        uint256 revealDeadline = submissionDeadline + 100;

        jobId = escrow.createJob(
            provider,
            BUDGET,
            TASK_HASH,
            expectedCommitment,
            CANONICALIZATION_HASH,
            acceptanceDeadline,
            submissionDeadline,
            revealDeadline,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
    }

    function createAcceptedJob() internal returns (uint256 jobId) {
        jobId = createFundedJob();
        vm.prank(provider);
        escrow.acceptJob(jobId);
    }

    function createAcceptedJobWithBudgetAndExpectedCommitment(uint256 budget, bytes32 expectedCommitment)
        internal
        returns (uint256 jobId)
    {
        jobId = createFundedJobWithBudgetAndExpectedCommitment(budget, expectedCommitment);
        vm.prank(provider);
        escrow.acceptJob(jobId);
    }

    function createAcceptedJobWithExpectedCommitment(bytes32 expectedCommitment) internal returns (uint256 jobId) {
        jobId = createFundedJobWithExpectedCommitment(expectedCommitment);
        vm.prank(provider);
        escrow.acceptJob(jobId);
    }

    function createSubmittedJob() internal returns (uint256 jobId) {
        return createSubmittedJobWithProviderAnswers(buildAnswerArray(50, "provider"));
    }

    function createSubmittedJobWithProviderAnswers(bytes32[] memory providerAnswers) internal returns (uint256 jobId) {
        jobId = createAcceptedJob();
        bytes32 providerCommitment = keccak256(abi.encode(providerAnswers));
        vm.prank(provider);
        escrow.submitResultCommitment(jobId, providerCommitment);
    }

    function createSubmittedJobWithBudget(uint256 budget) internal returns (uint256 jobId) {
        bytes32[] memory providerAnswers = buildAnswerArray(50, "provider");
        jobId = createAcceptedJobWithBudgetAndExpectedCommitment(
            budget, keccak256(abi.encode(buildAnswerArray(50, "expected")))
        );
        vm.prank(provider);
        escrow.submitResultCommitment(jobId, keccak256(abi.encode(providerAnswers)));
    }

    function createScoredJobWithBudgetAndProviderAnswers(uint256 budget, bytes32[] memory providerAnswers)
        internal
        returns (uint256 jobId)
    {
        bytes32 expectedCommitment = keccak256(abi.encode(buildAnswerArray(50, "expected")));
        jobId = createAcceptedJobWithBudgetAndExpectedCommitment(budget, expectedCommitment);
        bytes32 providerCommitment = keccak256(abi.encode(providerAnswers));
        vm.prank(provider);
        escrow.submitResultCommitment(jobId, providerCommitment);

        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        vm.prank(client);
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function createScoredJobForProvider(address jobProvider, bytes32[] memory providerAnswers)
        internal
        returns (uint256 jobId)
    {
        bytes32[] memory expectedAnswers = buildAnswerArray(50, "expected");
        vm.startPrank(client);
        usdc.approve(address(escrow), BUDGET);
        jobId = escrow.createJob(
            jobProvider,
            BUDGET,
            TASK_HASH,
            keccak256(abi.encode(expectedAnswers)),
            CANONICALIZATION_HASH,
            block.timestamp + 100,
            block.timestamp + 200,
            block.timestamp + 300,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
        vm.prank(jobProvider);
        escrow.acceptJob(jobId);
        vm.prank(jobProvider);
        escrow.submitResultCommitment(jobId, keccak256(abi.encode(providerAnswers)));
        vm.prank(client);
        escrow.revealAndScore(jobId, expectedAnswers, providerAnswers);
    }

    function createSubmittedJobWithExpectedCommitmentAndProviderAnswers(
        bytes32 expectedCommitment,
        bytes32[] memory providerAnswers
    ) internal returns (uint256 jobId) {
        jobId = createAcceptedJobWithExpectedCommitment(expectedCommitment);
        bytes32 providerCommitment = keccak256(abi.encode(providerAnswers));
        vm.prank(provider);
        escrow.submitResultCommitment(jobId, providerCommitment);
    }

    function createJobWithToken(VeriqEscrow localEscrow, address tokenAddress, uint256 budget)
        internal
        returns (uint256 jobId)
    {
        vm.startPrank(client);
        ITestToken(tokenAddress).approve(address(localEscrow), budget);
        uint256 acceptanceDeadline = block.timestamp + 100;
        uint256 submissionDeadline = acceptanceDeadline + 100;
        uint256 revealDeadline = submissionDeadline + 100;
        jobId = localEscrow.createJob(
            provider,
            budget,
            TASK_HASH,
            keccak256(abi.encode(buildAnswerArray(50, "expected"))),
            CANONICALIZATION_HASH,
            acceptanceDeadline,
            submissionDeadline,
            revealDeadline,
            metricPoints,
            payoutBps
        );
        vm.stopPrank();
    }

    function createSubmittedJobWithToken(VeriqEscrow localEscrow, address tokenAddress, uint256 budget)
        internal
        returns (uint256 jobId)
    {
        jobId = createJobWithToken(localEscrow, tokenAddress, budget);
        vm.prank(provider);
        localEscrow.acceptJob(jobId);
        vm.prank(provider);
        localEscrow.submitResultCommitment(jobId, keccak256(abi.encode(buildAnswerArray(50, "provider"))));
    }

    function acceptanceDeadlineOf(uint256 jobId) internal view returns (uint256 deadline) {
        (,,,,,, deadline,,,) = escrow.getJob(jobId);
    }

    function submissionDeadlineOf(uint256 jobId) internal view returns (uint256 deadline) {
        (,,,,,,, deadline,,) = escrow.getJob(jobId);
    }

    function revealDeadlineOf(uint256 jobId) internal view returns (uint256 deadline) {
        (,,,,,,,, deadline,) = escrow.getJob(jobId);
    }

    function localAcceptanceDeadlineOf(VeriqEscrow localEscrow, uint256 jobId)
        internal
        view
        returns (uint256 deadline)
    {
        (,,,,,, deadline,,,) = localEscrow.getJob(jobId);
    }

    function localSubmissionDeadlineOf(VeriqEscrow localEscrow, uint256 jobId)
        internal
        view
        returns (uint256 deadline)
    {
        (,,,,,,, deadline,,) = localEscrow.getJob(jobId);
    }

    function localRevealDeadlineOf(VeriqEscrow localEscrow, uint256 jobId) internal view returns (uint256 deadline) {
        (,,,,,,,, deadline,) = localEscrow.getJob(jobId);
    }

    function assertProviderHistory(
        VeriqEscrow targetEscrow,
        address targetProvider,
        uint256 measuredJobs,
        uint256 cumulativeQualityBps,
        uint256 averageQualityBps,
        uint256 completedJobs,
        uint256 submissionDefaults
    ) internal view {
        (
            uint256 storedMeasuredJobs,
            uint256 storedCumulativeQualityBps,
            uint256 storedAverageQualityBps,
            uint256 storedCompletedJobs,
            uint256 storedSubmissionDefaults
        ) = targetEscrow.getProviderHistory(targetProvider);
        assertEq(storedMeasuredJobs, measuredJobs);
        assertEq(storedCumulativeQualityBps, cumulativeQualityBps);
        assertEq(storedAverageQualityBps, averageQualityBps);
        assertEq(storedCompletedJobs, completedJobs);
        assertEq(storedSubmissionDefaults, submissionDefaults);
    }

    function buildProviderAnswersWithMatches(uint256 correctCount) internal pure returns (bytes32[] memory answers) {
        answers = new bytes32[](50);
        bytes32[] memory expectedAnswers = new bytes32[](50);
        for (uint256 i = 0; i < 50; i++) {
            expectedAnswers[i] = keccak256(abi.encodePacked("expected-", i));
        }
        for (uint256 i = 0; i < 50; i++) {
            answers[i] = i < correctCount ? expectedAnswers[i] : keccak256(abi.encodePacked("provider-", i));
        }
    }

    function buildAnswerArray(uint256 count, string memory prefix) internal pure returns (bytes32[] memory answers) {
        answers = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            answers[i] = keccak256(abi.encodePacked(prefix, "-", i));
        }
    }
}
