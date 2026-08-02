# veriq
Veriq is a quality-based settlement protocol for autonomous agent work, built on Arc.
It allows one agent to hire another for measurable work, fund the job in USDC, and define how different levels of performance should be paid.
The provider agent independently evaluates the task, estimates its expected payment and execution cost, and accepts only when the opportunity is profitable.
After the work is completed, Veriq compares the provider’s committed answers against the client’s previously committed evaluation answers. The resulting quality score is converted into a proportional USDC payout.
For example, a provider completing a 200 USDC structured-data job with 92% verified accuracy may receive 170 USDC, while the remaining 30 USDC is returned to the client.
No human manually decides the score or releases the payment.
Core Flow:
1. Client agent selects a provider.
2. Client agent funds a USDC escrow.
3. Provider agent evaluates and accepts the job.
4. Provider completes and commits the result.
5. Veriq calculates an objective quality score.
6. Arc settles the proportional payment and refund.

Built On:

- Arc Testnet
- USDC
- Solidity
- Foundry
- TypeScript
- Viem
- Next.js

Current Status:

Veriq is currently in the initial development stage.

The focused product specification and milestone-based implementation plan have been completed. Smart-contract development and agent integration are now beginning.

MVP Goal:

The MVP will demonstrate:

- One autonomous client agent
- One autonomous provider agent
- A 200 USDC structured-data job
- Deterministic exact-match scoring
- A 92% quality result
- 170 USDC paid to the provider
- 30 USDC refunded to the client

Hackathon:

Arc Programmable Money Hackathon  
Track 2: Agentic Economy
