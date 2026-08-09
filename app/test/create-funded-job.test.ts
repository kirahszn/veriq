import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { encodeAbiParameters, encodeEventTopics, type Address, type Hash, type Hex } from "viem";
import { veriqEscrowExecuteAbi } from "../src/lib/arc/abi/veriq-escrow-execute";
import {
  INTERACTIVE_BUDGET,
  INTERACTIVE_EXPECTED_COMMITMENT,
  INTERACTIVE_PROVIDER_ADDRESS,
  buildExpectedAnswerHashes,
  buildInteractiveJobParameters,
  commitExpectedAnswers,
  parsePersistedInteractiveJob,
  serializeInteractiveJob,
} from "../src/lib/arc/interactive-job";
import {
  createBrowserJobAdapter,
  executeCreateFundedJob,
  type CreateFundedJobAdapter,
  type FundedJobReadback,
  type JobCreatedData,
} from "../src/lib/wallet/createFundedJob";
import type { InjectedProvider } from "../src/lib/wallet/injectedWallet";

const CLIENT = "0x1111111111111111111111111111111111111111" as Address;
const OTHER = "0x2222222222222222222222222222222222222222" as Address;
const APPROVAL_HASH = `0x${"a".repeat(64)}` as Hash;
const CREATE_HASH = `0x${"b".repeat(64)}` as Hash;

class FakeAdapter implements CreateFundedJobAdapter {
  balance = INTERACTIVE_BUDGET;
  allowance = INTERACTIVE_BUDGET;
  blockTimestamp = 2_000_000_000n;
  approvalAmount: bigint | null = null;
  approveError: Error | null = null;
  createError: Error | null = null;
  receiptErrorLabel: string | null = null;
  revalidateErrorAt = 0;
  revalidateCalls = 0;
  createdArgs: ReturnType<typeof buildInteractiveJobParameters> | null = null;
  event: JobCreatedData = { jobId: 77n, client: CLIENT, provider: INTERACTIVE_PROVIDER_ADDRESS, budget: INTERACTIVE_BUDGET };
  readbackOverride: Partial<FundedJobReadback> = {};
  balanceReads = 0;
  allowanceReads = 0;

  async revalidate() { this.revalidateCalls += 1; if (this.revalidateCalls === this.revalidateErrorAt) throw new Error("Connected wallet account or chain changed. Creation stopped."); }
  async readBalance() { this.balanceReads += 1; return this.balance; }
  async readAllowance() { this.allowanceReads += 1; return this.allowance; }
  async approveExact(_client: Address, amount: bigint) { if (this.approveError) throw this.approveError; this.approvalAmount = amount; this.allowance = amount; return APPROVAL_HASH; }
  async waitForSuccessfulReceipt(hash: Hash, label: string) { if (this.receiptErrorLabel === label) throw new Error(`${label} transaction reverted.`); return { logs: [{ data: hash, topics: [] }] }; }
  async latestBlockTimestamp() { return this.blockTimestamp; }
  async createJob(_client: Address, args: ReturnType<typeof buildInteractiveJobParameters>) { if (this.createError) throw this.createError; this.createdArgs = args; return CREATE_HASH; }
  decodeJobCreated() { return this.event; }
  async readJob(): Promise<FundedJobReadback> {
    const args = this.createdArgs ?? buildInteractiveJobParameters(this.blockTimestamp);
    return { client: CLIENT, provider: INTERACTIVE_PROVIDER_ADDRESS, budget: INTERACTIVE_BUDGET, taskSpecHash: args.taskSpecHash,
      expectedAnswerCommitment: args.expectedAnswerCommitment, canonicalizationVersionHash: args.canonicalizationVersionHash,
      acceptanceDeadline: args.acceptanceDeadline, submissionDeadline: args.submissionDeadline, revealDeadline: args.revealDeadline, status: 1,
      ...this.readbackOverride };
  }
}

test("the retained 50-answer fixture reproduces the exact commitment", () => {
  const answers = buildExpectedAnswerHashes();
  assert.equal(answers.length, 50);
  assert.equal(commitExpectedAnswers(answers), INTERACTIVE_EXPECTED_COMMITMENT);
});

test("insufficient USDC prevents approval and create writes", async () => {
  const fake = new FakeAdapter(); fake.balance = INTERACTIVE_BUDGET - 1n;
  await assert.rejects(executeCreateFundedJob(fake, CLIENT), /1\.000000 ERC-20 USDC/);
  assert.equal(fake.approvalAmount, null); assert.equal(fake.createdArgs, null);
});

test("existing sufficient allowance skips approval", async () => {
  const fake = new FakeAdapter();
  await executeCreateFundedJob(fake, CLIENT);
  assert.equal(fake.approvalAmount, null); assert.ok(fake.createdArgs);
});

test("insufficient allowance performs exact one-job approval", async () => {
  const fake = new FakeAdapter(); fake.allowance = 0n;
  const result = await executeCreateFundedJob(fake, CLIENT);
  assert.equal(fake.approvalAmount, 1_000_000n);
  assert.equal(result.approvalTransactionHash, APPROVAL_HASH);
  assert.equal(fake.allowanceReads, 2);
});

test("approval rejection stops creation", async () => {
  const fake = new FakeAdapter(); fake.allowance = 0n; fake.approveError = new Error("User rejected request (4001)");
  await assert.rejects(executeCreateFundedJob(fake, CLIENT), /rejected/);
  assert.equal(fake.createdArgs, null);
});

test("failed approval receipt stops creation", async () => {
  const fake = new FakeAdapter(); fake.allowance = 0n; fake.receiptErrorLabel = "USDC approval";
  await assert.rejects(executeCreateFundedJob(fake, CLIENT), /approval transaction reverted/);
  assert.equal(fake.createdArgs, null);
});

test("account or chain change between approval and creation blocks creation", async () => {
  for (const changed of ["account", "chain"]) {
    const fake = new FakeAdapter(); fake.allowance = 0n; fake.revalidateErrorAt = 3;
    await assert.rejects(executeCreateFundedJob(fake, CLIENT), new RegExp(changed === "account" ? "account or chain changed" : "account or chain changed"));
    assert.equal(fake.createdArgs, null);
  }
});

test("fresh deadlines derive from the latest Arc block timestamp", async () => {
  const fake = new FakeAdapter(); fake.blockTimestamp = 1_234_567n;
  await executeCreateFundedJob(fake, CLIENT);
  assert.equal(fake.createdArgs?.acceptanceDeadline, 1_238_167n);
  assert.equal(fake.createdArgs?.submissionDeadline, 1_241_767n);
  assert.equal(fake.createdArgs?.revealDeadline, 1_245_367n);
});

test("createJob simulation or wallet rejection stops before receipt confirmation", async () => {
  for (const message of ["createJob simulation failed", "User rejected createJob (4001)"]) {
    const fake = new FakeAdapter(); fake.createError = new Error(message);
    await assert.rejects(executeCreateFundedJob(fake, CLIENT), new RegExp(message.split(" ")[0], "i"));
  }
});

test("failed createJob receipt is rejected", async () => {
  const fake = new FakeAdapter(); fake.receiptErrorLabel = "Create job";
  await assert.rejects(executeCreateFundedJob(fake, CLIENT), /Create job transaction reverted/);
});

test("JobCreated decoding returns the authoritative event Job ID", () => {
  const adapter = createBrowserJobAdapter({ request: async () => null } as unknown as InjectedProvider);
  const topics = encodeEventTopics({ abi: veriqEscrowExecuteAbi, eventName: "JobCreated", args: { jobId: 88n, client: CLIENT, provider: INTERACTIVE_PROVIDER_ADDRESS } });
  const data = encodeAbiParameters([{ type: "uint256" }], [INTERACTIVE_BUDGET]);
  assert.deepEqual(adapter.decodeJobCreated([{ topics: topics as readonly Hex[], data }]), { jobId: 88n, client: CLIENT, provider: INTERACTIVE_PROVIDER_ADDRESS, budget: INTERACTIVE_BUDGET });
});

test("emitted client, provider, and budget are validated", async () => {
  for (const event of [
    { jobId: 1n, client: OTHER, provider: INTERACTIVE_PROVIDER_ADDRESS, budget: INTERACTIVE_BUDGET },
    { jobId: 1n, client: CLIENT, provider: OTHER, budget: INTERACTIVE_BUDGET },
    { jobId: 1n, client: CLIENT, provider: INTERACTIVE_PROVIDER_ADDRESS, budget: 2n },
  ]) {
    const fake = new FakeAdapter(); fake.event = event;
    await assert.rejects(executeCreateFundedJob(fake, CLIENT), /JobCreated/);
  }
});

test("authoritative Job ID is persisted from JobCreated and Funded is read back", async () => {
  const fake = new FakeAdapter(); fake.event.jobId = 999n;
  const result = await executeCreateFundedJob(fake, CLIENT);
  assert.equal(result.persisted.jobId, "999"); assert.equal(result.persisted.status, "Funded");
  fake.readbackOverride.status = 2;
  await assert.rejects(executeCreateFundedJob(fake, CLIENT), /not Funded/);
});

test("public persisted state round-trips and rejects tampering", async () => {
  const result = await executeCreateFundedJob(new FakeAdapter(), CLIENT);
  const serialized = serializeInteractiveJob(result.persisted);
  assert.deepEqual(parsePersistedInteractiveJob(serialized), result.persisted);
  const tampered = JSON.stringify({ ...result.persisted, expectedAnswerCommitment: `0x${"0".repeat(64)}` });
  assert.equal(parsePersistedInteractiveJob(tampered), null);
});

test("designated provider cannot create the job as its own client", async () => {
  const fake = new FakeAdapter();
  await assert.rejects(executeCreateFundedJob(fake, INTERACTIVE_PROVIDER_ADDRESS), /cannot also be the designated provider/);
  assert.equal(fake.balanceReads, 0);
});

test("Step 02 source refreshes balance and reset occurs by connected-session unmount", () => {
  const step = readFileSync("src/components/CreateFundedJobStep.tsx", "utf8");
  const wallet = readFileSync("src/components/ExecutionWallet.tsx", "utf8");
  assert.match(step, /await onBalanceRefresh\(\)/);
  assert.match(step, /await onBalanceRefresh\(\)/);
  assert.match(wallet, /connected && providerRef\.current && <InteractiveJobFlow key=\{address\.toLowerCase\(\)\}/);
});

test("Milestone 2 write surface excludes later lifecycle methods and private configuration", () => {
  const source = ["src/lib/arc/abi/veriq-escrow-execute.ts", "src/lib/wallet/createFundedJob.ts", "src/components/CreateFundedJobStep.tsx"].map(file => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /acceptJob|submitResultCommitment|revealAndScore|settle|claimProvider|ProviderHistory/);
  assert.doesNotMatch(source, /privateKey|mnemonic|arc\/config|localWallets|arcWallets/);
});
