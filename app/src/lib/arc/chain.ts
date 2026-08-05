import { defineChain, type Address } from "viem";

export const ARC_TESTNET_CHAIN_ID = 5_042_002;
export const ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.io";
export const ARC_TESTNET_WEBSOCKET_URL = "wss://rpc.testnet.arc.io";
export const ARC_TESTNET_EXPLORER_URL = "https://testnet.arcscan.app";
export const ARC_USDC_ADDRESS: Address = "0x3600000000000000000000000000000000000000";
export const ARC_USDC_DECIMALS = 6;

export const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_TESTNET_RPC_URL], webSocket: [ARC_TESTNET_WEBSOCKET_URL] } },
  blockExplorers: { default: { name: "ArcScan", url: ARC_TESTNET_EXPLORER_URL } },
  testnet: true,
});

export function assertOfficialArcRpc(url: string): void {
  if (url !== ARC_TESTNET_RPC_URL) throw new Error(`Unsupported Arc RPC URL: ${url}`);
}

export function assertArcChainId(chainId: number): void {
  if (chainId !== ARC_TESTNET_CHAIN_ID) throw new Error(`Arc chain mismatch: expected ${ARC_TESTNET_CHAIN_ID}, received ${chainId}`);
}
