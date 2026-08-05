// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PayoutCurve.sol";
import "./ExactMatchScorer.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract VeriqEscrow {
    using PayoutCurve for uint256;

    error ZeroTokenAddress();
    error ZeroProvider();
    error ProviderIsClient();
    error ZeroBudget();
    error ZeroTaskSpecHash();
    error ZeroExpectedAnswerCommitment();
    error ZeroCanonicalizationVersionHash();
    error AcceptanceDeadlineNotInFuture();
    error SubmissionDeadlineNotAfterAcceptance();
    error RevealDeadlineNotAfterSubmission();
    error TokenTransferFailed();
    error NotJobProvider();
    error JobAlreadyAccepted();
    error AcceptanceDeadlineExpired();
    error SubmissionDeadlineExpired();
    error ZeroResultCommitment();
    error InvalidJobState();
    error NonexistentJob();
    error UnauthorizedCaller();
    error RevealDeadlineExpired();
    error InvalidAnswerCount();
    error ExpectedCommitmentMismatch();
    error ProviderCommitmentMismatch();
    error ReentrancyGuard();
    error DeadlineNotPassed();

    enum JobStatus {
        None,
        Funded,
        Accepted,
        Submitted,
        Scored,
        Settled,
        AcceptanceExpired,
        ProviderSubmissionDefault,
        ClientRevealDefault
    }

    struct Job {
        address client;
        address provider;
        uint256 budget;
        bytes32 taskSpecHash;
        bytes32 expectedAnswerCommitment;
        bytes32 canonicalizationVersionHash;
        uint256 acceptanceDeadline;
        uint256 submissionDeadline;
        uint256 revealDeadline;
        bytes32 resultCommitment;
        uint256 qualityBps;
        uint256 payoutBps;
        uint256 providerPayment;
        uint256 clientRefund;
        JobStatus status;
    }

    struct ProviderHistory {
        uint256 measuredJobs;
        uint256 cumulativeQualityBps;
        uint256 completedJobs;
        uint256 submissionDefaults;
    }

    IERC20 public immutable escrowToken;
    uint256 public nextJobId = 1;
    bool internal settlementInProgress;

    mapping(uint256 => Job) internal jobs;
    mapping(uint256 => uint256[]) internal metricPointsByJob;
    mapping(uint256 => uint256[]) internal payoutBpsByJob;
    mapping(address => ProviderHistory) internal providerHistory;

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

    constructor(address tokenAddress) {
        if (tokenAddress == address(0)) revert ZeroTokenAddress();
        escrowToken = IERC20(tokenAddress);
    }

    function createJob(
        address provider,
        uint256 budget,
        bytes32 taskSpecHash,
        bytes32 expectedAnswerCommitment,
        bytes32 canonicalizationVersionHash,
        uint256 acceptanceDeadline,
        uint256 submissionDeadline,
        uint256 revealDeadline,
        uint256[] memory metricPoints,
        uint256[] memory payoutBps
    ) external returns (uint256 jobId) {
        if (provider == address(0)) revert ZeroProvider();
        if (provider == msg.sender) revert ProviderIsClient();
        if (budget == 0) revert ZeroBudget();
        if (taskSpecHash == bytes32(0)) revert ZeroTaskSpecHash();
        if (expectedAnswerCommitment == bytes32(0)) revert ZeroExpectedAnswerCommitment();
        if (canonicalizationVersionHash == bytes32(0)) revert ZeroCanonicalizationVersionHash();
        if (acceptanceDeadline <= block.timestamp) revert AcceptanceDeadlineNotInFuture();
        if (submissionDeadline <= acceptanceDeadline) revert SubmissionDeadlineNotAfterAcceptance();
        if (revealDeadline <= submissionDeadline) revert RevealDeadlineNotAfterSubmission();

        PayoutCurve.evaluate(metricPoints[0], metricPoints, payoutBps);

        jobId = nextJobId;
        safeTransferFrom(msg.sender, address(this), budget);

        Job storage job = jobs[jobId];
        job.client = msg.sender;
        job.provider = provider;
        job.budget = budget;
        job.taskSpecHash = taskSpecHash;
        job.expectedAnswerCommitment = expectedAnswerCommitment;
        job.canonicalizationVersionHash = canonicalizationVersionHash;
        job.acceptanceDeadline = acceptanceDeadline;
        job.submissionDeadline = submissionDeadline;
        job.revealDeadline = revealDeadline;
        job.status = JobStatus.Funded;

        metricPointsByJob[jobId] = metricPoints;
        payoutBpsByJob[jobId] = payoutBps;

        emit JobCreated(jobId, msg.sender, provider, budget);
        nextJobId = jobId + 1;
    }

    function safeTransferFrom(address from, address to, uint256 amount) internal {
        bytes memory data = abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount);
        (bool success, bytes memory returnData) = address(escrowToken).call(data);
        if (!success) revert TokenTransferFailed();
        if (returnData.length > 0) {
            if (returnData.length != 32 || !abi.decode(returnData, (bool))) revert TokenTransferFailed();
        }
    }

    function safeTransfer(address to, uint256 amount) internal {
        bytes memory data = abi.encodeWithSelector(IERC20.transfer.selector, to, amount);
        (bool success, bytes memory returnData) = address(escrowToken).call(data);
        if (!success) {
            if (returnData.length == 0) revert TokenTransferFailed();
            assembly {
                revert(add(returnData, 32), mload(returnData))
            }
        }
        if (returnData.length > 0) {
            if (returnData.length != 32 || !abi.decode(returnData, (bool))) revert TokenTransferFailed();
        }
    }

    function getJob(uint256 jobId)
        external
        view
        returns (
            address client,
            address provider,
            uint256 budget,
            bytes32 taskSpecHash,
            bytes32 expectedAnswerCommitment,
            bytes32 canonicalizationVersionHash,
            uint256 acceptanceDeadline,
            uint256 submissionDeadline,
            uint256 revealDeadline,
            JobStatus status
        )
    {
        Job storage job = jobs[jobId];
        return (
            job.client,
            job.provider,
            job.budget,
            job.taskSpecHash,
            job.expectedAnswerCommitment,
            job.canonicalizationVersionHash,
            job.acceptanceDeadline,
            job.submissionDeadline,
            job.revealDeadline,
            job.status
        );
    }

    function getResultCommitment(uint256 jobId) external view returns (bytes32) {
        return jobs[jobId].resultCommitment;
    }

    function acceptJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (job.status == JobStatus.Accepted) revert JobAlreadyAccepted();
        if (job.status != JobStatus.Funded) revert InvalidJobState();
        if (msg.sender != job.provider) revert NotJobProvider();
        if (block.timestamp > job.acceptanceDeadline) revert AcceptanceDeadlineExpired();

        job.status = JobStatus.Accepted;
        emit JobAccepted(jobId, msg.sender);
    }

    function submitResultCommitment(uint256 jobId, bytes32 resultCommitment) external {
        Job storage job = jobs[jobId];
        if (msg.sender != job.provider) revert NotJobProvider();
        if (job.status != JobStatus.Accepted) revert InvalidJobState();
        if (block.timestamp > job.submissionDeadline) revert SubmissionDeadlineExpired();
        if (resultCommitment == bytes32(0)) revert ZeroResultCommitment();

        job.resultCommitment = resultCommitment;
        job.status = JobStatus.Submitted;

        emit ResultCommitted(jobId, msg.sender);
    }

    function revealAndScore(
        uint256 jobId,
        bytes32[] calldata expectedAnswerHashes,
        bytes32[] calldata providerAnswerHashes
    ) external {
        Job storage job = jobs[jobId];
        if (job.client == address(0) && job.provider == address(0) && job.status == JobStatus.None) {
            revert NonexistentJob();
        }
        if (msg.sender != job.client) revert UnauthorizedCaller();
        if (job.status != JobStatus.Submitted) revert InvalidJobState();
        if (block.timestamp > job.revealDeadline) revert RevealDeadlineExpired();
        if (expectedAnswerHashes.length != 50 || providerAnswerHashes.length != 50) revert InvalidAnswerCount();

        bytes32 expectedCommitment = keccak256(abi.encode(expectedAnswerHashes));
        bytes32 providerCommitment = keccak256(abi.encode(providerAnswerHashes));

        if (expectedCommitment != job.expectedAnswerCommitment) revert ExpectedCommitmentMismatch();
        if (providerCommitment != job.resultCommitment) revert ProviderCommitmentMismatch();

        uint256 qualityBps = ExactMatchScorer.score(expectedAnswerHashes, providerAnswerHashes);
        job.qualityBps = qualityBps;
        job.status = JobStatus.Scored;

        emit JobScored(jobId, qualityBps);
    }

    function settle(uint256 jobId) external {
        if (settlementInProgress) revert ReentrancyGuard();

        Job storage job = jobs[jobId];
        if (job.client == address(0) && job.provider == address(0) && job.status == JobStatus.None) {
            revert NonexistentJob();
        }
        if (job.status != JobStatus.Scored) revert InvalidJobState();

        settlementInProgress = true;

        uint256 qualityBps = job.qualityBps;
        uint256[] memory metricPoints = metricPointsByJob[jobId];
        uint256[] memory payoutPoints = payoutBpsByJob[jobId];
        uint256 payoutBps = PayoutCurve.evaluate(qualityBps, metricPoints, payoutPoints);
        uint256 providerPayment = (job.budget * payoutBps) / 10_000;
        uint256 clientRefund = job.budget - providerPayment;

        job.payoutBps = payoutBps;
        job.providerPayment = providerPayment;
        job.clientRefund = clientRefund;
        job.status = JobStatus.Settled;

        ProviderHistory storage history = providerHistory[job.provider];
        history.measuredJobs += 1;
        history.cumulativeQualityBps += qualityBps;
        history.completedJobs += 1;

        safeTransfer(job.provider, providerPayment);
        safeTransfer(job.client, clientRefund);

        settlementInProgress = false;

        emit JobSettled(jobId, qualityBps, payoutBps, providerPayment, clientRefund);
        emitProviderHistoryUpdated(job.provider, history);
    }

    function claimAcceptanceExpiry(uint256 jobId) external {
        if (settlementInProgress) revert ReentrancyGuard();

        Job storage job = jobs[jobId];
        requireJobExists(job);
        if (job.status != JobStatus.Funded) revert InvalidJobState();
        if (block.timestamp <= job.acceptanceDeadline) revert DeadlineNotPassed();

        settlementInProgress = true;
        uint256 clientRefund = job.budget;
        job.payoutBps = 0;
        job.providerPayment = 0;
        job.clientRefund = clientRefund;
        job.status = JobStatus.AcceptanceExpired;

        safeTransfer(job.client, clientRefund);
        settlementInProgress = false;

        emit AcceptanceExpired(jobId, clientRefund);
    }

    function claimProviderSubmissionDefault(uint256 jobId) external {
        if (settlementInProgress) revert ReentrancyGuard();

        Job storage job = jobs[jobId];
        requireJobExists(job);
        if (job.status != JobStatus.Accepted) revert InvalidJobState();
        if (block.timestamp <= job.submissionDeadline) revert DeadlineNotPassed();

        settlementInProgress = true;
        uint256 clientRefund = job.budget;
        job.payoutBps = 0;
        job.providerPayment = 0;
        job.clientRefund = clientRefund;
        job.status = JobStatus.ProviderSubmissionDefault;

        ProviderHistory storage history = providerHistory[job.provider];
        history.submissionDefaults += 1;

        safeTransfer(job.client, clientRefund);
        settlementInProgress = false;

        emit ProviderSubmissionDefaulted(jobId, clientRefund);
        emitProviderHistoryUpdated(job.provider, history);
    }

    function claimClientRevealDefault(uint256 jobId) external {
        if (settlementInProgress) revert ReentrancyGuard();

        Job storage job = jobs[jobId];
        requireJobExists(job);
        if (job.status != JobStatus.Submitted) revert InvalidJobState();
        if (block.timestamp <= job.revealDeadline) revert DeadlineNotPassed();

        settlementInProgress = true;
        uint256 providerPayment = job.budget;
        job.payoutBps = 10_000;
        job.providerPayment = providerPayment;
        job.clientRefund = 0;
        job.status = JobStatus.ClientRevealDefault;

        ProviderHistory storage history = providerHistory[job.provider];
        history.completedJobs += 1;

        safeTransfer(job.provider, providerPayment);
        settlementInProgress = false;

        emit ClientRevealDefaulted(jobId, providerPayment);
        emitProviderHistoryUpdated(job.provider, history);
    }

    function emitProviderHistoryUpdated(address provider, ProviderHistory storage history) internal {
        emit ProviderHistoryUpdated(
            provider,
            history.measuredJobs,
            history.cumulativeQualityBps,
            history.completedJobs,
            history.submissionDefaults
        );
    }

    function requireJobExists(Job storage job) internal view {
        if (job.client == address(0) && job.provider == address(0) && job.status == JobStatus.None) {
            revert NonexistentJob();
        }
    }

    function getMetricPoints(uint256 jobId) external view returns (uint256[] memory) {
        return metricPointsByJob[jobId];
    }

    function getPayoutBps(uint256 jobId) external view returns (uint256[] memory) {
        return payoutBpsByJob[jobId];
    }

    function getQualityBps(uint256 jobId) external view returns (uint256) {
        return jobs[jobId].qualityBps;
    }

    function getStatus(uint256 jobId) external view returns (JobStatus) {
        return jobs[jobId].status;
    }

    function getSettlementResult(uint256 jobId)
        external
        view
        returns (uint256 qualityBps, uint256 payoutBps, uint256 providerPayment, uint256 clientRefund, JobStatus status)
    {
        Job storage job = jobs[jobId];
        return (job.qualityBps, job.payoutBps, job.providerPayment, job.clientRefund, job.status);
    }

    function getProviderHistory(address provider)
        external
        view
        returns (
            uint256 measuredJobs,
            uint256 cumulativeQualityBps,
            uint256 averageQualityBps,
            uint256 completedJobs,
            uint256 submissionDefaults
        )
    {
        ProviderHistory storage history = providerHistory[provider];
        measuredJobs = history.measuredJobs;
        cumulativeQualityBps = history.cumulativeQualityBps;
        averageQualityBps = measuredJobs == 0 ? 0 : cumulativeQualityBps / measuredJobs;
        completedJobs = history.completedJobs;
        submissionDefaults = history.submissionDefaults;
    }
}
