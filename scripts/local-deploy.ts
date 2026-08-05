import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deployLocalContracts } from "../app/src/lib/contracts/deployment.ts";
import { createLocalWallets } from "../app/src/lib/wallet/localWallets.ts";

const wallets = await createLocalWallets();
const deployment = await deployLocalContracts(wallets.publicClient, wallets.deployer, wallets.chainId);
const directory = resolve("scripts/generated");
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, "local-deployment.json"), `${JSON.stringify(deployment, null, 2)}\n`);
console.log(JSON.stringify({ chainId: deployment.chainId, deployer: deployment.deployer, mockUsdc: deployment.mockUsdc, veriqEscrow: deployment.veriqEscrow, deploymentTransactions: deployment.transactions }, null, 2));
