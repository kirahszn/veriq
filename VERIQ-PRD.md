Veriq — Product Requirements Document

Version: 1.0 — Focused Hackathon MVP
Date: 1 August 2026
Hackathon: Arc Programmable Money Hackathon
Track: Track 2 — Agentic Economy
Build period: Four weeks
Status: MVP build specification

One-line description

Veriq lets one autonomous agent hire another, objectively measure the completed work and settle a proportional USDC payment on Arc without a human deciding the outcome.

Tagline

Verified quality. Programmable payout.


1. Executive Summary

Veriq is a quality-based settlement protocol for autonomous agent work.

A client agent needs a measurable task completed. It reviews available provider agents, selects one, defines a USDC budget and creates a quality-based payout curve.

A provider agent independently evaluates the opportunity. It estimates the quality it can deliver, the payment it is likely to receive and the cost of completing the work. It accepts the job only when the expected return is profitable.

After completing the task, the provider submits a committed result. Veriq objectively measures the result using a deterministic exact-match scoring contract.

The measured quality score is converted into a proportional USDC payout.

For example:

* 70% quality may receive no payment.
* 90% quality may receive 80% of the budget.
* 98% quality may receive the full budget.
* A 92% result may receive 85% of the budget.

The provider receives the earned amount. The unused portion is automatically refunded to the client.

No human manually approves the result, chooses the final payment or releases the escrow.

The MVP proves one complete autonomous commerce loop:

One agent hires another agent, both make independent financial decisions, the work is objectively measured, and Arc settles the proportional USDC payment.


1. Product Thesis

Autonomous agents should not be paid merely because they submitted something.

They should be paid according to the measurable value of what they delivered.

Most digital escrow systems use binary settlement:

* Pass → receive everything.
* Fail → receive nothing.

This model is unsuitable for work where quality exists on a spectrum.

A result that is 92% correct may still be valuable, but it should not necessarily receive the same payment as a result that is 99% correct.

Veriq introduces a simpler settlement primitive:

Convert a verified outcome score into a programmable USDC payout.


1. MVP Priority

The entire MVP has one priority:

Prove autonomous, quality-based agent settlement on Arc.

The product must visibly demonstrate that:

1. A client agent identifies work that needs to be outsourced.
2. The client agent selects a provider using defined economic criteria.
3. The client agent funds the job in USDC.
4. The provider agent independently evaluates the opportunity.
5. The provider accepts only when the expected value is positive.
6. The provider completes and submits the work.
7. A deterministic scoring contract measures the result.
8. Veriq converts the score into a proportional payment.
9. Arc settles the provider payment and client refund.
10. No human manually chooses the final outcome.

Anything that does not directly support this flow is outside the MVP.


1. Product Positioning

Veriq is

* Quality-based settlement infrastructure for autonomous agents.
* A programmable USDC escrow tied to measurable performance.
* A protocol for converting verified outcomes into payments.
* A composable settlement layer for agent marketplaces and autonomous businesses.

Veriq is not

* A general agent marketplace.
* A chatbot with a wallet.
* A public job board.
* A subjective AI evaluator.
* An LLM judging network.
* A freelance platform.
* A dispute-resolution marketplace.
* A general reputation protocol.
* A cross-chain payment product.


1. Demonstration Use Case

The MVP will demonstrate a structured supplier-data extraction job.

A procurement client agent needs supplier records extracted and normalized from a fixed dataset.

Each record contains fields such as:

{
  "supplier_id": "SUP-0041",
  "country": "NG",
  "category": "industrial_pumps",
  "compliance_status": true
}

The client agent hires a provider agent to extract and normalize the records.

The result is evaluated using canonical exact-match scoring.

Demo values

Maximum budget: 200 testnet USDC

Payout curve:

* 70% quality → 0% payout
* 90% quality → 80% payout
* 98% quality → 100% payout

Provider result:

* 46 correct records out of 50
* Measured quality: 92%
* Earned payout percentage: 85%
* Provider payment: 170 USDC
* Client refund: 30 USDC

The demonstration should make one point unmistakable:

The provider is paid according to verified result quality—not merely because it returned a file.


1. Target Users

6.1 Client Agent

An autonomous agent that needs measurable work completed by another agent.

For the MVP, the client agent behaves like a procurement or orchestration agent.

It must be able to:

* Define the task.
* Set the maximum budget.
* Select an approved scoring method.
* Define the payout curve.
* Compare provider options.
* Select a provider.
* Fund escrow.
* Monitor the job.
* Reveal evaluation data.
* Receive the unused budget.
* Update future provider preferences.

6.2 Provider Agent

An autonomous service agent that performs structured data extraction.

It must be able to:

* Read the task requirements.
* Read the maximum possible payment.
* Understand the payout curve.
* Estimate expected quality.
* Estimate execution cost.
* Calculate expected payment.
* Accept or reject the job.
* Complete the extraction task.
* Submit a committed result.
* Receive the proportional payment.
* Update its future acceptance strategy.

6.3 Integrator

A future agent marketplace, orchestration platform or autonomous business that may use Veriq as its settlement layer.

The integrator is not required for the MVP, but the contract architecture should not prevent later integration.


1. Core Autonomous Behaviour

The autonomy must be visible in the product and demo.

The agents should not simply execute buttons pressed by a human.

They should produce structured decision records based on defined inputs.

7.1 Client-Agent Decision

The client agent compares available providers using:

* Expected quality.
* Historical measured quality.
* Provider price.
* Completion reliability.
* Estimated completion time.

Example client-agent output:

Task: Extract and normalize 50 supplier records
Maximum budget: 200 USDC
Minimum acceptable quality: 70%
Provider A
Expected quality: 93%
Estimated completion time: 3 minutes
Historical quality: 94%
Maximum requested payment: 200 USDC
Provider B
Expected quality: 81%
Estimated completion time: 2 minutes
Historical quality: 83%
Maximum requested payment: 150 USDC
Selected provider: Provider A
Reason:
Provider A has the highest expected usable value under the selected payout curve.

The decision should be derived from explicit rules rather than hidden free-form reasoning.

7.2 Provider-Agent Decision

The provider evaluates:

* Maximum budget.
* Payout curve.
* Estimated achievable quality.
* Estimated payout.
* Compute or execution cost.
* Minimum required profit.

Example provider-agent output:

Maximum payout: 200 USDC
Estimated quality: 93%
Estimated payout: 172.50 USDC
Estimated execution cost: 22 USDC
Estimated profit: 150.50 USDC
Minimum required profit: 30 USDC
Decision: Accept

The provider must reject a job when the expected profit is below its configured threshold.

7.3 Human Approval Boundary

For the demo, the client agent operates under a simple spending policy:

The client agent may autonomously create structured-data jobs worth up to 250 USDC.
Jobs above 250 USDC require human approval.
Only the approved ExactMatchScorer contract may be used.

Because the demo budget is 200 USDC, no human approval is required.


1. Functional Scope

8.1 Included in the MVP

The MVP must include:

* One client agent.
* One provider agent.
* Two or three mock provider profiles for comparison.
* One structured data-extraction task.
* One escrow token: USDC.
* One scoring adapter: canonical exact match.
* One piecewise-linear payout curve.
* Client funding.
* Provider acceptance.
* Provider result commitment.
* Evaluation reveal.
* Deterministic score calculation.
* Proportional provider payout.
* Automatic client refund.
* Basic provider performance history.
* Job events and transaction records.
* A simple frontend for viewing the entire workflow.

8.2 Excluded from the MVP

The MVP will not include:

* A public marketplace.
* User-created provider listings.
* Multiple task categories.
* Multiple scoring adapters.
* Subjective evaluation.
* LLM-based grading.
* Semantic similarity.
* Human arbitration.
* Zero-knowledge proofs.
* Trusted execution environments.
* Confidential datasets.
* General dispute resolution.
* Cross-chain settlement.
* Lending or credit.
* Provider staking.
* Slashing.
* Governance.
* Multi-token escrow.
* Production-grade reputation.
* Complex provider discovery.
* A full developer SDK.
* Mobile applications.
* Production decentralization.


1. Job Lifecycle

The MVP job lifecycle contains seven states.

State 1: Funded

The client agent:

* Defines the task.
* Selects the provider.
* Sets the budget.
* Defines the payout curve.
* Selects the scoring contract.
* Commits the evaluation dataset.
* Sets the deadlines.
* Transfers USDC into escrow.

Status: Funded

State 2: Accepted

The provider agent:

* Reads the job terms.
* Estimates its expected payout and cost.
* Accepts when expected value is positive.

Status: Accepted

State 3: Submitted

The provider:

* Completes the extraction task.
* Canonicalizes the output.
* Creates the result commitment.
* Submits the result root and content hash.

The provider cannot modify the committed result afterward.

Status: Submitted

State 4: Revealed

The client reveals the committed evaluation answers and required proofs.

The contract verifies that the revealed evaluation data matches the earlier commitment.

Status: Revealed

State 5: Scored

The ExactMatchScorer compares the committed provider answers with the committed expected answers.

It calculates a quality score from 0 to 10,000 basis points.

Status: Scored

State 6: Settled

Veriq:

* Converts the score into payout basis points.
* Calculates the provider payment.
* Calculates the client refund.
* Transfers USDC to both parties.
* Updates the provider’s measured history.
* Emits the settlement event.

Status: Settled

State 7: Defaulted

A default state is used when either party fails to complete a required action before its deadline.

Possible default reasons:

* Provider did not submit.
* Client did not reveal.
* Job was not accepted.
* Settlement was not finalized within the allowed period.

Status: Defaulted


1. Default and Timeout Rules

Timeout handling is required because autonomous parties may fail to act.

10.1 Provider Fails to Accept

When the acceptance deadline passes:

* The job is cancelled.
* The complete escrow is returned to the client.
* No provider reputation record is created.

10.2 Provider Fails to Submit

When the submission deadline passes:

* The complete remaining escrow is returned to the client.
* The job is recorded as ProviderSubmissionDefault.
* The event may be recorded in the provider’s reliability history.
* It must not be recorded as a measured-quality result.

10.3 Client Fails to Reveal

When the client does not reveal the evaluation data before the reveal deadline:

* The provider receives a predefined fallback payment.
* The client receives the remaining amount.
* The job is recorded as ClientRevealDefault.
* The outcome must not count as a measured-quality result.

For the MVP:

* Provider fallback payment: 80% of the budget.
* Client refund: 20% of the budget.

For a 200 USDC budget:

* Provider receives 160 USDC.
* Client receives 40 USDC.

This prevents the client from withholding evaluation data to avoid payment after the provider has completed the job.

The fallback percentage must be visible before the provider accepts.
L

1. Scoring Mechanism

11.1 Approved Scoring Adapter

The MVP uses one contract:

ExactMatchScorer.sol

It supports objective structured outputs that can be represented as canonical hashes.

11.2 Canonicalization

Client and provider must use the same versioned canonicalization rules.

The MVP rules are:

* UTF-8 encoding.
* Leading and trailing whitespace removed.
* Lowercase conversion for configured string fields.
* Country codes represented using two uppercase letters.
* Dates represented as YYYY-MM-DD.
* Boolean values represented as true or false.
* Numeric values represented as fixed integer strings.
* No floating-point values.
* No locale-dependent formatting.
* Object fields stored in a fixed order.

The canonicalization version must be recorded in the job.

Example:

canonicalizationVersion = "veriq-canonical-v1"

11.3 Score Calculation

For each evaluated record:

expectedHash = keccak256(canonicalExpectedAnswer)
providerHash = keccak256(canonicalProviderAnswer)

A record is correct when:

expectedHash == providerHash

The final metric is:

metric = floor(correctCount × 10,000 / totalRecordCount)

Example:

correctCount = 46
totalRecordCount = 50
metric = floor(46 × 10,000 / 50)
metric = 9,200
quality = 92%

⸻

1. Payout-Curve Mechanism

The client defines a monotonic piecewise-linear payout curve.

The curve contains:

uint16[] metricPoints;
uint16[] payoutBps;

For the MVP:

metricPoints = [7000, 9000, 9800]
payoutBps    = [0, 8000, 10000]

This means:

* 70% quality → 0% payout.
* 90% quality → 80% payout.
* 98% quality → 100% payout.

12.1 Interpolation

For a score between two points:

P = P1 + ((M - M1) × (P2 - P1)) / (M2 - M1)

Where:

* M is the measured quality.
* M1 and M2 are the surrounding quality points.
* P1 and P2 are the surrounding payout percentages.

Integer division rounds down.

12.2 Example

Measured quality:

92% = 9,200 basis points

The score is between:

90% quality → 80% payout
98% quality → 100% payout

Relative progress:

(9200 - 9000) / (9800 - 9000)
= 200 / 800
= 25%

Payout:

80% + 25% of the remaining 20%
= 85%

For a 200 USDC budget:

Provider payment = 170 USDC
Client refund = 30 USDC

⸻

1. Smart-Contract Architecture

The MVP should use three small contracts rather than one oversized protocol.

13.1 VeriqEscrow.sol

Primary responsibilities:

* Create jobs.
* Receive USDC budget.
* Store client and provider addresses.
* Store dataset commitment.
* Store provider-result commitment.
* Store payout curve.
* Store deadlines.
* Record job status.
* Call the approved scoring contract.
* Calculate proportional payouts.
* Transfer provider payment.
* Return client refund.
* Handle timeout paths.
* Emit job events.

Important functions may include:

createJob(...)
acceptJob(uint256 jobId)
submitResult(uint256 jobId, bytes32 resultRoot, bytes32 resultHash)
revealAndScore(uint256 jobId, EvaluationRecord[] records, bytes32[][] proofs)
settle(uint256 jobId)
claimProviderSubmissionDefault(uint256 jobId)
claimClientRevealDefault(uint256 jobId)
cancelUnacceptedJob(uint256 jobId)

13.2 ExactMatchScorer.sol

Responsibilities:

* Verify expected-answer commitments.
* Verify provider-answer commitments.
* Compare answer hashes.
* Count exact matches.
* Return a score from 0 to 10,000.

The scorer must not:

* Hold funds.
* Select providers.
* Modify payout curves.
* Decide defaults.
* Maintain reputation.

13.3 ProviderHistory.sol

Responsibilities:

* Record objectively measured jobs.
* Store total measured quality.
* Store the number of scored jobs.
* Store completed-job count.
* Store default count separately.

Example:

struct ProviderStats {
    uint32 measuredJobs;
    uint64 cumulativeQualityBps;
    uint32 completedJobs;
    uint32 submissionDefaults;
}

Average quality:

averageQuality = cumulativeQualityBps / measuredJobs

Default and fallback settlements must not be included in average measured quality.

⸻

1. Job Data Structure

A simplified job structure may include:

struct Job {
    address client;
    address provider;
    address escrowToken;
    uint256 budget;
    bytes32 taskSpecHash;
    bytes32 datasetRoot;
    bytes32 providerResultRoot;
    address scoringAdapter;
    bytes32 canonicalizationVersion;
    uint64 acceptanceDeadline;
    uint64 submissionDeadline;
    uint64 revealDeadline;
    uint16[] metricPoints;
    uint16[] payoutBps;
    JobStatus status;
}

The final implementation may separate dynamic arrays from the main struct for gas efficiency.

1. Required Events

The contracts should emit clear events for the frontend and demo.

event JobCreated(
    uint256 indexed jobId,
    address indexed client,
    address indexed provider,
    uint256 budget
);
event JobAccepted(
    uint256 indexed jobId,
    address indexed provider
);
event ResultSubmitted(
    uint256 indexed jobId,
    bytes32 resultRoot
);
event EvaluationRevealed(
    uint256 indexed jobId
);
event JobScored(
    uint256 indexed jobId,
    uint16 qualityBps
);
event JobSettled(
    uint256 indexed jobId,
    uint16 qualityBps,
    uint16 payoutBps,
    uint256 providerPayment,
    uint256 clientRefund
);
event JobDefaulted(
    uint256 indexed jobId,
    DefaultReason reason
);

1. Offchain Agent Architecture

16.1 Client Agent

The client agent contains five modules:

Task Planner

Creates the structured extraction task and expected schema.

Provider Selector

Compares provider profiles using a deterministic policy.

Example selection formula:

providerScore =
    expectedQuality × 0.45
  + historicalQuality × 0.30
  + reliability × 0.15
  + priceEfficiency × 0.10

The exact formula can be simplified, but it must be visible and reproducible.

Budget and Curve Module

Sets:

* Maximum budget.
* Minimum acceptable quality.
* Payout curve.
* Deadlines.

For the demo, these values may be generated from a predefined policy template.

Wallet Module

Signs and sends Arc transactions.

The wallet module:

* Approves USDC spending.
* Creates the job.
* Funds escrow.
* Reveals evaluation data.
* Reads settlement events.

History Module

Reads provider performance and decides whether the provider remains eligible for future work.

16.2 Provider Agent

The provider agent contains four modules:

Opportunity Evaluator

Calculates:

expectedPayout = payoutCurve(estimatedQuality) × budget
expectedProfit = expectedPayout - estimatedExecutionCost

Acceptance Policy

Accepts when:

expectedProfit >= minimumProfit

It may also require:

* Supported task type.
* Supported scoring adapter.
* Sufficient deadline.
* Maximum execution cost below a configured threshold.

Execution Module

Performs the structured supplier-data extraction.

For the MVP, the input dataset should be controlled and small enough to produce a reliable demonstration.

Submission Module

Canonicalizes outputs, builds the result commitment and submits the transaction.

1. Frontend Requirements

The frontend should make the agent behaviour and settlement flow easy to understand.

It does not need to resemble a production marketplace.

17.1 Screen One: Client Agent Decision

Display:

* Task description.
* Maximum budget.
* Quality requirements.
* Available provider profiles.
* Expected provider quality.
* Historical provider performance.
* Expected economic value.
* Selected provider.
* Structured reason for the selection.

Main action shown:

Client agent selected Provider A and funded 200 USDC.

17.2 Screen Two: Provider Agent Decision

Display:

* Job budget.
* Payout curve.
* Provider’s estimated quality.
* Estimated payment.
* Estimated execution cost.
* Expected profit.
* Acceptance decision.

Main action shown:

Provider agent accepted because expected profit was positive.

17.3 Screen Three: Live Job

Display:

* Job ID.
* Client address.
* Provider address.
* Escrow amount.
* Current state.
* Arc transaction hashes.
* Submission commitment.
* Evaluation commitment.
* Deadlines.
* Completed agent actions.

17.4 Screen Four: Score and Settlement

Display:

* Correct records.
* Total evaluated records.
* Measured quality.
* Payout curve.
* Position of the score on the curve.
* Payout percentage.
* Provider payment.
* Client refund.
* Final Arc transaction.
* Updated provider history.

The settlement screen is the most important screen in the product.

1. Arc Integration Requirements

The MVP must be deployed and demonstrated on Arc testnet.

Arc should not appear merely as a chain logo.

Its role must be tied to the product design.

18.1 USDC Escrow

All job budgets, payments and refunds are denominated in USDC.

USDC is used for:

* Client operating capital.
* Provider revenue.
* Escrow.
* Refunds.
* Economic decision-making.

18.2 Arc Transactions

The following actions occur on Arc:

* Job creation.
* Escrow funding.
* Provider acceptance.
* Result submission.
* Evaluation reveal.
* Scoring.
* Provider payment.
* Client refund.
* Provider-history update.

18.3 Stable Operating Unit

The agents calculate:

* Budget.
* Expected payment.
* Execution cost.
* Profit.
* Refund.

Using the same stable unit of account.

18.4 Fast Final Settlement

Once the settlement transaction is finalized, both agents can immediately use the result.

The provider can treat the payment as earned capital.

The client can treat the unused amount as refunded capital.

1. API Requirements

The MVP may expose a minimal API for the frontend and agents.

Suggested endpoints:

POST /api/jobs/prepare
POST /api/client/select-provider
POST /api/provider/evaluate
POST /api/provider/execute
POST /api/results/canonicalize
POST /api/results/build-root
GET  /api/jobs/:jobId
GET  /api/providers
GET  /api/providers/:address/history

The smart contracts remain the source of truth for:

* Job status.
* Commitments.
* Budget.
* Score.
* Payment.
* Refund.
* Provider measured history.



1. Security Requirements

The MVP must prevent:

* Reentrancy during settlement.
* Multiple settlement.
* Multiple refunds.
* Provider result modification after submission.
* Client evaluation modification after commitment.
* Unauthorized acceptance.
* Unauthorized submission.
* Unauthorized reveal.
* Invalid payout curves.
* Payouts exceeding the escrow.
* Reputation updates from unscored jobs.
* Deadline bypass.
* Use of unapproved scoring contracts.

Required protections:

* ReentrancyGuard.
* Checks-effects-interactions.
* Safe USDC transfer handling.
* Explicit status checks.
* Access controls based on job parties.
* Curve validation during job creation.
* Settlement-state locking.
* Comprehensive unit tests.



1. Success Metrics

The MVP is successful when it completes one full job on Arc testnet and proves the following.

Technical Success

* Client agent funds escrow autonomously.
* Provider agent accepts autonomously.
* Provider result is committed.
* Evaluation data is verified.
* Score is calculated deterministically.
* Payout curve is applied correctly.
* Provider receives the correct USDC amount.
* Client receives the correct refund.
* Settlement cannot occur twice.
* Timeout paths work correctly.

Product Success

A judge can understand within two minutes:

* Why binary escrow is inadequate.
* Why the two agents make independent decisions.
* How quality is measured.
* How quality controls payment.
* Why no human is needed to release the funds.
* Why Arc and USDC are central to the system.

Demo Success

The final demonstration shows:

Budget: 200 USDC
Measured quality: 92%
Payout percentage: 85%
Provider payment: 170 USDC
Client refund: 30 USDC
Human settlement decision: None

1. MVP Acceptance Criteria

The product is ready for submission only when all the following are true.

Client Agent

* Can compare at least two provider profiles.
* Selects a provider using a visible policy.
* Can autonomously create and fund a job below its spending limit.
* Can commit the evaluation dataset.
* Can reveal evaluation data.

Provider Agent

* Can calculate expected payment.
* Can calculate expected profit.
* Can accept a profitable job.
* Can reject an unprofitable mock job.
* Can complete the structured extraction task.
* Can submit a committed result.

Smart Contracts

* Hold USDC safely.
* Enforce job states.
* Validate the payout curve.
* Prevent result replacement.
* Verify exact-match scoring.
* Calculate the correct quality score.
* Calculate the correct payment and refund.
* Settle atomically.
* Handle provider submission default.
* Handle client reveal default.

Frontend

* Displays both agents’ economic decisions.
* Displays the complete job state.
* Displays Arc transaction references.
* Displays the score and payout curve.
* Displays the provider payment and client refund.

Testing

* Unit tests cover all contract functions.
* Tests cover payout interpolation.
* Tests cover 0%, partial and 100% payouts.
* Tests cover deadline failures.
* Tests cover unauthorized calls.
* Tests cover duplicate settlement attempts.
* One end-to-end Arc testnet transaction flow succeeds.


1. Four-Week Build Plan

Week One — Contracts and Economic Logic

Build:

* VeriqEscrow.sol
* ExactMatchScorer.sol
* Payout-curve calculation
* USDC escrow
* Job state machine
* Basic unit tests

End-of-week outcome:

A manually created job can be scored and settled correctly.

Week Two — Autonomous Agents

Build:

* Client provider-selection policy
* Client spending policy
* Provider expected-profit calculation
* Provider accept/reject policy
* Structured extraction workflow
* Canonicalization utilities
* Result-commitment utilities

End-of-week outcome:

Both agents can independently make and record economic decisions.

Week Three — Frontend and Arc Integration

Build:

* Client decision screen
* Provider decision screen
* Live job screen
* Settlement screen
* Arc wallet integration
* Arc testnet deployment
* Event indexing

End-of-week outcome:

The complete flow works through the product interface on Arc testnet.

Week Four — Reliability and Presentation

Complete:

* Default and timeout paths
* Contract security review
* End-to-end testing
* Demo dataset
* Demo script
* Error handling
* Documentation
* Deployment
* Submission video

End-of-week outcome:

A reliable and understandable ten-minute demonstration.

1. Demo Narrative

The demonstration should follow this order.

1. The Problem

Autonomous agents can already hire and pay one another, but most payment systems only ask whether a result was submitted or approved.

They do not measure how much value was actually delivered.

1. The Client Agent

The client agent needs 50 supplier records extracted.

It compares providers and selects the one with the best expected value.

It creates a 200 USDC job and defines a quality-based payout curve.

1. The Provider Agent

The provider reads the job terms.

It estimates:

* 93% achievable quality.
* 172.50 USDC expected payment.
* 22 USDC execution cost.
* 150.50 USDC expected profit.

It autonomously accepts the job.

1. The Work

The provider extracts and canonicalizes the supplier records.

It commits the result on Arc.

1. Verification

Veriq compares the provider’s committed answers against the committed evaluation answers.

The provider scores 92%.

1. Settlement

The payout curve converts the 92% score into an 85% payment.

Arc settles:

* 170 USDC to the provider.
* 30 USDC back to the client.

1. Conclusion

The provider was not paid because it returned a result. It was paid according to the verified quality of the value it delivered.


1. Roadmap

The following may be introduced after the MVP:

* Numeric-tolerance scoring.
* Classification metrics.
* Additional task categories.
* Public provider discovery.
* Agent SDK.
* Marketplace integrations.
* More advanced provider histories.
* Confidential evaluation.
* Verifiable offchain computation.
* Bonded evaluator networks.
* Cross-chain USDC sourcing.
* Agent credit and working capital.
* Human escalation for subjective disputes.

These features are not required to validate the core product.

1. Final Product Statement

Veriq is a quality-based settlement layer for autonomous agent commerce.

It allows a client agent to outsource measurable work, allows a provider agent to independently evaluate and accept the opportunity, and uses deterministic verification to settle a proportional USDC payment on Arc.

The MVP proves one focused idea:

Autonomous agents can hire, perform, verify and settle work according to measurable value without requiring a human to decide the payment.
