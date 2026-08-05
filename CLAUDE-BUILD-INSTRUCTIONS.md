# VERIQ — MASTER BUILD INSTRUCTIONS

Project: Veriq
Hackathon: Arc Programmable Money Hackathon
Track: Agentic Economy

This document is the authoritative implementation guide for the project.

The implementation agent must follow this document exactly.

The implementation agent must NEVER skip milestones.

The implementation agent must NEVER introduce additional features that are not requested.

The implementation agent must always optimize for shipping a working MVP.

--------------------------------------------------
CORE PRODUCT
--------------------------------------------------

Veriq is a quality-based settlement protocol for autonomous agent work.

The MVP demonstrates one complete autonomous commerce loop:

1. A client agent hires a provider agent.
2. The client funds a USDC escrow.
3. The provider independently evaluates whether the job is profitable.
4. The provider performs measurable work.
5. The provider commits its result.
6. The client reveals its committed evaluation data.
7. Veriq objectively measures quality.
8. Arc settles a proportional USDC payout.
9. No human manually approves the result.

Nothing outside this loop belongs in the MVP.

--------------------------------------------------
GENERAL BUILD RULES
--------------------------------------------------

The repository is GREENFIELD.

Assume no application code exists.

Never invent architecture beyond this document.

Never over-engineer.

Never replace working code unless required.

Always keep implementations simple.

Always prefer deterministic logic.

Never continue to the next milestone unless all tests pass.

After every milestone:

- run tests
- explain what was built
- explain what was tested
- report failures honestly
- stop and wait for approval

Never silently continue.

--------------------------------------------------
PROJECT PRIORITY
--------------------------------------------------

Backend correctness is more important than frontend appearance.

Priority order:

1. Smart contracts
2. Local testing
3. Agent logic
4. Arc integration
5. Frontend

--------------------------------------------------
MVP DATASET
--------------------------------------------------

Use exactly:

50 supplier records

The MVP scoring dataset never changes.

No dynamic dataset generation.

--------------------------------------------------
SCORING DESIGN
--------------------------------------------------

Use:

Canonical Exact Match only.

Do NOT implement:

- semantic similarity
- AI judging
- LLM evaluation
- fuzzy matching
- BLEU
- F1
- embeddings

Quality score:

qualityBps =
floor(correctAnswers × 10000 / 50)

Example:

46 correct

quality = 9200

--------------------------------------------------
COMMITMENT DESIGN
--------------------------------------------------

No Merkle trees.

No holdout.

No randomness.

No salts.

No future block hashes.

No trusted evaluator.

The client computes:

50 expected-answer hashes

Then computes ONE commitment:

keccak256(
    abi.encode(answerHashes)
)

Store only the commitment.

Do not store the full hash array.

Provider performs exactly the same process.

During revealAndSettle:

Both full arrays are supplied.

The contract recomputes both commitments.

Only if both commitments match:

compare all 50 hashes.

--------------------------------------------------
COMMITMENT ENCODING
--------------------------------------------------

Lock this forever.

Solidity:

keccak256(
    abi.encode(answerHashes)
)

TypeScript:

keccak256(
    encodeAbiParameters(
        [{ type: "bytes32[]" }],
        [answerHashes]
    )
)

Never use:

encodePacked

Never concatenate hashes manually.

--------------------------------------------------
PAYOUT CURVE
--------------------------------------------------

Curve:

metric:

7000
9000
9800

payout:

0
8000
10000

Example:

92%

↓

9200

↓

85%

↓

170 USDC provider

30 USDC refund

--------------------------------------------------
CLIENT DEFAULT
--------------------------------------------------

If:

provider accepted

AND

provider submitted

BUT

client failed to reveal

Then:

provider receives 100%

client receives 0%

Status:

ClientRevealDefault

No quality score recorded.

Provider history must NOT update.

--------------------------------------------------
SCORER
--------------------------------------------------

ExactMatchScorer must be:

internal

pure

No storage.

No external calls.

Input:

bytes32[]

bytes32[]

Output:

qualityBps

--------------------------------------------------
PROVIDER HISTORY
--------------------------------------------------

Store inside:

VeriqEscrow.sol

Do NOT build a separate ProviderHistory contract.

--------------------------------------------------
LOCAL TOKEN
--------------------------------------------------

Use:

MockUSDC

6 decimals

--------------------------------------------------
ARC TESTNET
--------------------------------------------------

Before integration verify:

Chain ID

USDC

RPC

Do not hardcode incorrect values.

--------------------------------------------------
WALLETS
--------------------------------------------------

Use Viem.

Three wallets:

deployer

client

provider

Circle Wallet integration is NOT part of the MVP.

--------------------------------------------------
FRONTEND
--------------------------------------------------

Keep extremely simple.

No animations.

No fancy UI.

Only enough to demonstrate:

job

commit

reveal

score

settlement

--------------------------------------------------
MILESTONE PROCESS
--------------------------------------------------

Milestone 0

Repository audit

Architecture validation

Arc verification

No application code

-----------------------------------

Milestone 1

Scaffold repository

Foundry

Next.js

TypeScript

Package management

Environment

No business logic

-----------------------------------

Milestone 2

MockUSDC

Unit tests

-----------------------------------

Milestone 3

PayoutCurve library

Interpolation

Tests

-----------------------------------

Milestone 4

VeriqEscrow

Create Job

Escrow

Statuses

Tests

-----------------------------------

Milestone 5

Commitments

Commit verification

Tests

-----------------------------------

Milestone 6

ExactMatchScorer

Tests

-----------------------------------

Milestone 7

Settlement

Refund

Provider payment

Tests

-----------------------------------

Milestone 8

Provider Agent

Client Agent

Decision logic

Tests

-----------------------------------

Milestone 9

Arc integration

USDC

Deployment

End-to-end tests

-----------------------------------

Milestone 10

Frontend

Demo flow

--------------------------------------------------
TESTING
--------------------------------------------------

Every milestone must end with:

✓ build

✓ compile

✓ tests

✓ explanation

No failures may be ignored.

--------------------------------------------------
FINAL RULE
--------------------------------------------------

Do not continue automatically.

Stop after every milestone.

Wait for explicit approval before starting the next milestone.
