import { createPublicClient, formatUnits, http } from "viem";
import { ARC_TESTNET_RPC_URL, ARC_USDC_ADDRESS, arcTestnet, assertOfficialArcRpc } from "../app/src/lib/arc/chain.ts";
import { loadArcPublicConfig } from "../app/src/lib/arc/config.ts";
import { probeArc } from "../app/src/lib/arc/probe.ts";

assertOfficialArcRpc(ARC_TESTNET_RPC_URL);
const config = loadArcPublicConfig(process.env);
const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL) });
const report = await probeArc(client, config);
console.log(JSON.stringify({
  rpcHost: new URL(ARC_TESTNET_RPC_URL).host, chainId: report.chainId, latestBlock: report.latestBlock.toString(),
  usdcAddress: ARC_USDC_ADDRESS, usdcCodePresent: report.usdcCodePresent ? "yes" : "no", usdcDecimals: report.usdcDecimals,
  usdcSymbol: report.usdcSymbol, usdcName: report.usdcName,
  wallets: report.wallets.map((wallet) => ({ role: wallet.role, address: wallet.address, nativeBalance: formatUnits(wallet.nativeBalance, 18), usdcInterfaceBalance: formatUnits(wallet.usdcBalance, 6), readiness: wallet.readiness })),
}, null, 2));
