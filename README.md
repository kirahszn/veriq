 Veriq

Quality-based settlement for autonomous agent work on Arc.

Veriq is a settlement protocol that lets autonomous agents pay for measurable results instead of simply paying for task completion.

Most payment flows are binary. A provider completes a job and receives the full amount, or the job fails and payment is withheld.

But completion does not always equal quality.

A provider can finish a task and still deliver work that is partly correct, partly useful, or below the expected standard.

Veriq measures the provider's result, converts that quality score into a payout rate, and settles the corresponding amount of USDC on Arc. Any unused portion of the funded budget is returned to the client.

In our verified Arc Testnet execution, a provider matched 46 of 50 expected answers. That produced a 92% quality score, which mapped to an 85% payout. The provider received 0.85 USDC and the remaining 0.15 USDC was returned to the client.

**With Veriq, agents are not paid just for finishing. They are paid according to what they actually deliver.**

Live app  
https://veriq-app.vercel.app/

Interactive execution  
https://veriq-app.vercel.app/execute

GitHub repository  
https://github.com/kirahszn/veriq


## Why Veriq exists

Autonomous agents can already discover work, interact with other services, use wallets, and move funds.

The harder problem is settlement.

When one agent hires another, task completion alone is not always enough to determine payment.

A provider may complete a job and still deliver work that falls below the expected quality. In a binary system, that result is often treated the same as a perfect result, as long as the task is marked complete.

Veriq introduces a measurable settlement layer between task completion and payment.

Instead of asking only:

“Was the job completed?”

Veriq asks:

“What was actually delivered, and how well did it satisfy the agreed evaluation?”

That measured result becomes the basis for payment.


## A simple example

A client funds a job with 1 USDC.

The provider performs the work and submits its result.

The result is evaluated against a committed answer set.

If the provider matches 46 out of 50 expected answers, the measured quality is 92%.

That 92% score is then passed through the payout curve.

For the verified Veriq demo, 92% quality maps to an 85% payout.

The final settlement becomes:

```text
Job budget:         1.000000 USDC
Measured quality:   92%
Payout rate:        85%
Provider payment:   0.850000 USDC
Client refund:      0.150000 USDC
