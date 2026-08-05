import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Abi, Hex } from "viem";

interface ForgeArtifact { abi: Abi; bytecode: { object: Hex } }

function loadArtifact(relativePath: string): ForgeArtifact {
  const path = resolve(process.cwd(), relativePath);
  const artifact = JSON.parse(readFileSync(path, "utf8")) as ForgeArtifact;
  if (!artifact.abi || !artifact.bytecode?.object) throw new Error(`Invalid Forge artifact: ${path}`);
  return artifact;
}

export function loadContractArtifacts(): { mockUsdc: ForgeArtifact; veriqEscrow: ForgeArtifact } {
  const prefix = process.cwd().endsWith("app") ? "../contracts/out" : "contracts/out";
  return {
    mockUsdc: loadArtifact(`${prefix}/MockUSDC.sol/MockUSDC.json`),
    veriqEscrow: loadArtifact(`${prefix}/VeriqEscrow.sol/VeriqEscrow.json`),
  };
}
