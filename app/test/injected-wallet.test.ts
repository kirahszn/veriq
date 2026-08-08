import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Address } from "viem";
import {
  WalletConnectionError,
  connectInjectedWallet,
  ensureArcTestnet,
  formatUsdcBalance,
  getInjectedProvider,
  readInjectedChainId,
  subscribeInjectedWallet,
  type InjectedProvider,
} from "../src/lib/wallet/injectedWallet";
import { ARC_TESTNET_CHAIN_ID } from "../src/lib/arc/chain";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as Address;
const ARC_HEX = `0x${ARC_TESTNET_CHAIN_ID.toString(16)}`;

class FakeProvider {
  chainId = ARC_HEX;
  accounts = [ACCOUNT];
  calls: Array<{ method: string; params?: unknown }> = [];
  listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  switchError: unknown = null;
  requestError: unknown = null;

  async request({ method, params }: { method: string; params?: unknown }) {
    this.calls.push({ method, params });
    if (method === "eth_requestAccounts" && this.requestError) throw this.requestError;
    if (method === "eth_requestAccounts" || method === "eth_accounts") return this.accounts;
    if (method === "eth_chainId") return this.chainId;
    if (method === "wallet_switchEthereumChain") {
      if (this.switchError) throw this.switchError;
      this.chainId = ARC_HEX;
      return null;
    }
    if (method === "wallet_addEthereumChain") {
      this.chainId = ARC_HEX;
      return null;
    }
    throw new Error(`Unexpected method ${method}`);
  }

  on(event: string, listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }
  removeListener(event: string, listener: (...args: unknown[]) => void) { this.listeners.get(event)?.delete(listener); }
  emit(event: string, value?: unknown) { for (const listener of this.listeners.get(event) ?? []) listener(value); }
}

const provider = (fake: FakeProvider) => fake as unknown as InjectedProvider;

test("missing browser injection is reported as no provider", () => {
  assert.equal(getInjectedProvider(), null);
});

test("successful account connection validates Arc Testnet", async () => {
  const fake = new FakeProvider();
  assert.equal(await connectInjectedWallet(provider(fake)), ACCOUNT);
  assert.equal(await readInjectedChainId(provider(fake)), ARC_TESTNET_CHAIN_ID);
  assert.ok(fake.calls.some(call => call.method === "eth_requestAccounts"));
});

test("wrong chain is detected and switched to Arc Testnet", async () => {
  const fake = new FakeProvider();
  fake.chainId = "0x1";
  await ensureArcTestnet(provider(fake));
  assert.ok(fake.calls.some(call => call.method === "wallet_switchEthereumChain"));
  assert.equal(fake.chainId, ARC_HEX);
});

test("unknown chain uses wallet_addEthereumChain with canonical Arc values", async () => {
  const fake = new FakeProvider();
  fake.chainId = "0x1";
  fake.switchError = { code: 4902 };
  await ensureArcTestnet(provider(fake));
  const add = fake.calls.find(call => call.method === "wallet_addEthereumChain");
  assert.ok(add);
  assert.match(JSON.stringify(add.params), new RegExp(ARC_HEX));
  assert.match(JSON.stringify(add.params), /rpc\.testnet\.arc\.io/);
});

test("wrong network remains an explicit error when switching fails", async () => {
  const fake = new FakeProvider();
  fake.chainId = "0x1";
  fake.switchError = { code: -32603 };
  await assert.rejects(ensureArcTestnet(provider(fake)), (error: unknown) => error instanceof WalletConnectionError && error.kind === "wrong-network");
});

test("user rejection is classified", async () => {
  const fake = new FakeProvider();
  fake.requestError = { code: 4001 };
  await assert.rejects(connectInjectedWallet(provider(fake)), (error: unknown) => error instanceof WalletConnectionError && error.kind === "rejected");
});

test("USDC balances always use six decimal places", () => {
  assert.equal(formatUsdcBalance(0n), "0.000000 USDC");
  assert.equal(formatUsdcBalance(1n), "0.000001 USDC");
  assert.equal(formatUsdcBalance(1_250_000n), "1.250000 USDC");
});

test("account, chain, and disconnect events are forwarded and cleaned up", () => {
  const fake = new FakeProvider();
  const seen: string[] = [];
  const cleanup = subscribeInjectedWallet(provider(fake), {
    accountsChanged: accounts => seen.push(`account:${accounts[0] ?? "none"}`),
    chainChanged: chain => seen.push(`chain:${chain}`),
    disconnect: () => seen.push("disconnect"),
  });
  fake.emit("accountsChanged", [ACCOUNT]);
  fake.emit("chainChanged", ARC_HEX);
  fake.emit("disconnect");
  assert.deepEqual(seen, [`account:${ACCOUNT}`, `chain:${ARC_HEX}`, "disconnect"]);
  cleanup();
  fake.emit("disconnect");
  assert.equal(seen.length, 3);
});

test("Milestone 1 browser wallet sources contain no transaction writes or private-key imports", () => {
  const source = [
    readFileSync("src/lib/wallet/injectedWallet.ts", "utf8"),
    readFileSync("src/components/ExecutionWallet.tsx", "utf8"),
    readFileSync("app/execute/page.tsx", "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /writeContract|sendTransaction|signTransaction|signMessage/);
  assert.doesNotMatch(source, /privateKey|mnemonic|arc\/config|localWallets|arcWallets/);
});
