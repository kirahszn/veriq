import { createPublicClient, http } from "viem";
import { loadContractArtifacts } from "../contracts/artifacts";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "./chain";
import { readLiveArcState } from "./read-core";
import { formatUsdcBaseUnits } from "./read-model";

const artifacts = loadContractArtifacts();
const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL, { timeout: 15_000, retryCount: 1 }) });
const result = await readLiveArcState(client, artifacts.veriqEscrow.abi, artifacts.mockUsdc.abi);

const report = {
  source: result.source,
  readOnly: true,
  chainId: result.chainId,
  blockNumber: result.blockNumber?.toString(),
  contractAddress: result.contractAddress,
  job: { id: result.job.id, client: result.job.client, provider: result.job.provider, budgetUsdc: formatUsdcBaseUnits(result.job.budget), status: result.job.status, qualityBps: result.job.qualityBps, payoutBps: result.job.payoutBps, providerPaymentUsdc: formatUsdcBaseUnits(result.job.providerPayment), clientRefundUsdc: formatUsdcBaseUnits(result.job.clientRefund) },
  providerHistory: Object.fromEntries(Object.entries(result.providerHistory).map(([key, value]) => [key, value.toString()])),
  escrowBalanceUsdc: formatUsdcBaseUnits(result.balances.escrow),
  readTimestamp: result.fetchedAt,
  warnings: result.warnings,
};
console.log(JSON.stringify(report, null, 2));
