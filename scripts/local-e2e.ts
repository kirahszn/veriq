import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProviderProfile } from "../app/src/agents/client/selectProvider.ts";
import { validateDeployment, type LocalDeployment } from "../app/src/lib/contracts/deployment.ts";
import { executeHappyPath } from "../app/src/lib/local-chain/executeFlow.ts";
import { createLocalWallets } from "../app/src/lib/wallet/localWallets.ts";

const deployment = JSON.parse(readFileSync(resolve("scripts/generated/local-deployment.json"), "utf8")) as LocalDeployment;
validateDeployment(deployment);
const wallets = await createLocalWallets();
const provider: ProviderProfile = {
  address: wallets.addresses.provider, supportedTaskType: "supplier-data-extraction", supportedScorer: "ExactMatchScorer",
  expectedQualityBps: 9400, historicalMeasuredQualityBps: 9500, reliabilityBps: 9700,
  expectedCompletionSeconds: 180, requestedMaxPaymentUsdc: "200",
};
const result = await executeHappyPath(wallets, deployment, [provider]);
console.log(JSON.stringify({ chainId: deployment.chainId, mockUsdc: deployment.mockUsdc, veriqEscrow: deployment.veriqEscrow, jobId: result.jobId.toString(), qualityBps: result.qualityBps.toString(), payoutBps: result.payoutBps.toString(), providerPayment: result.providerPayment.toString(), clientRefund: result.clientRefund.toString(), status: result.status, history: result.history.map(String), transactions: result.transactions }, null, 2));
