import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const target = ".env";
const force = process.argv.includes("--force");
const existing = existsSync(target) ? readFileSync(target, "utf8") : "";
const names = ["ARC_DEPLOYER_PRIVATE_KEY", "ARC_CLIENT_PRIVATE_KEY", "ARC_PROVIDER_PRIVATE_KEY"] as const;
if (!force && names.some((name) => new RegExp(`^${name}=`, "m").test(existing))) throw new Error("Arc wallet keys already exist; pass --force to replace them");
const keys = names.map(() => generatePrivateKey());
const addresses = keys.map((key) => privateKeyToAccount(key).address);
if (new Set(addresses.map((value) => value.toLowerCase())).size !== 3) throw new Error("Generated Arc wallet addresses are not distinct");
let output = existing;
for (const name of names) output = output.replace(new RegExp(`^${name}=.*(?:\r?\n|$)`, "m"), "");
if (output && !output.endsWith("\n")) output += "\n";
output += names.map((name, index) => `${name}=${keys[index]}`).join("\n") + "\n";
writeFileSync(target, output, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ deployer: addresses[0], client: addresses[1], provider: addresses[2] }, null, 2));
