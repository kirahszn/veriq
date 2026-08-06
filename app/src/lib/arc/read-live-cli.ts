import { createPublicClient, http } from "viem";
import { mockUsdcReadAbi } from "./abi/mock-usdc-read";
import { veriqEscrowReadAbi } from "./abi/veriq-escrow-read";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "./chain";
import { readLiveArcState } from "./read-core";
import { ARC_READ_TIMEOUT_MS, formatUsdcBaseUnits } from "./read-model";

const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL, { timeout: ARC_READ_TIMEOUT_MS, retryCount: 1 }) });
const result = await readLiveArcState(client, veriqEscrowReadAbi, mockUsdcReadAbi);

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
