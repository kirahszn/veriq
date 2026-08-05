import { unstable_cache } from "next/cache";
import { createPublicClient, http } from "viem";
import { loadContractArtifacts } from "../contracts/artifacts";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "./chain";
import { ARC_READ_REVALIDATE_SECONDS, readArcWithFallback } from "./read-core";
import type { ArcReadResult } from "./read-model";

function createArcReadClient() {
  return createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL, { timeout: 10_000, retryCount: 1 }) });
}

async function fetchArcReadStateSerialized() {
  const artifacts = loadContractArtifacts();
  const result = await readArcWithFallback(createArcReadClient(), artifacts.veriqEscrow.abi, artifacts.mockUsdc.abi);
  return JSON.stringify(result, (_, value) => typeof value === "bigint" ? { __veriqBigint: value.toString() } : value);
}

const getCachedArcReadState = unstable_cache(fetchArcReadStateSerialized, ["veriq-arc-job-1-read-v2"], { revalidate: ARC_READ_REVALIDATE_SECONDS, tags: ["veriq-arc-job-1"] });

export async function getArcReadState(): Promise<ArcReadResult> {
  const serialized = await getCachedArcReadState();
  return JSON.parse(serialized, (_, value) => value && typeof value === "object" && "__veriqBigint" in value ? BigInt(value.__veriqBigint) : value) as ArcReadResult;
}
