import { unstable_cache } from "next/cache";
import { createPublicClient, http } from "viem";
import { loadContractArtifacts } from "../contracts/artifacts";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "./chain";
import { ARC_READ_REVALIDATE_SECONDS, classifyReadFailure, readLiveArcState, verifiedFallback } from "./read-core";
import { ARC_READ_TIMEOUT_MS, type ArcReadResult } from "./read-model";
import { resolveServerRead } from "./read-server-policy";

function createArcReadClient() {
  return createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL, { timeout: ARC_READ_TIMEOUT_MS, retryCount: 1 }) });
}

async function fetchArcReadStateSerialized() {
  const artifacts = loadContractArtifacts();
  const result = await readLiveArcState(createArcReadClient(), artifacts.veriqEscrow.abi, artifacts.mockUsdc.abi);
  return JSON.stringify(result, (_, value) => typeof value === "bigint" ? { __veriqBigint: value.toString() } : value);
}

const getCachedArcReadState = unstable_cache(fetchArcReadStateSerialized, ["veriq-arc-job-1-read-v2"], { revalidate: ARC_READ_REVALIDATE_SECONDS, tags: ["veriq-arc-job-1"] });

export async function getArcReadState(options: { fresh?: boolean } = {}): Promise<ArcReadResult> {
  const serialized = await resolveServerRead(options, {
    readCached: getCachedArcReadState,
    readFresh: fetchArcReadStateSerialized,
    fallback: error => {
      const diagnostic = classifyReadFailure(error);
      console.warn("Arc server read fallback", { category: diagnostic.category, name: diagnostic.name, message: diagnostic.message });
      return JSON.stringify(verifiedFallback(diagnostic.warning), (_, value) => typeof value === "bigint" ? { __veriqBigint: value.toString() } : value);
    },
  });
  return JSON.parse(serialized, (_, value) => value && typeof value === "object" && "__veriqBigint" in value ? BigInt(value.__veriqBigint) : value) as ArcReadResult;
}
