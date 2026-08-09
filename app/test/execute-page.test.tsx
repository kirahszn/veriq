import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExecutePage from "../app/execute/page";
import { ExecutionWallet } from "../src/components/ExecutionWallet";
import { CreateFundedJobStep } from "../src/components/CreateFundedJobStep";
import { navigation } from "../src/components/AppShell";
import type { InjectedProvider } from "../src/lib/wallet/injectedWallet";

test("Execute route renders the Milestone 1 connection step", () => {
  const html = renderToStaticMarkup(React.createElement(ExecutePage));
  assert.match(html, /Run a settlement/i);
  assert.match(html, /01 \/ CONNECT/);
  assert.match(html, /Connect Wallet/);
});

test("disconnected wallet UI contains no role, address, or fake balance", () => {
  const html = renderToStaticMarkup(React.createElement(ExecutionWallet));
  assert.doesNotMatch(html, />Client</);
  assert.doesNotMatch(html, /USDC Balance/);
  assert.doesNotMatch(html, /0\.000000 USDC/);
  assert.doesNotMatch(html, /02 \/ CREATE \+ FUND/);
});

test("Execute is appended to navigation and preserves active-route behavior", () => {
  assert.deepEqual(navigation.at(-1), { href: "/execute", label: "Execute" });
});

test("local Disconnect is an explicit UI reset and permission disclaimer", () => {
  const source = readFileSync("src/components/ExecutionWallet.tsx", "utf8");
  assert.match(source, /onClick=\{reset\}>Disconnect/);
  assert.match(source, /permissions are managed by your wallet/);
});

test("connected Step 02 displays the designated provider and exact one-USDC policy", () => {
  const provider = { request: async () => null } as unknown as InjectedProvider;
  const html = renderToStaticMarkup(React.createElement(CreateFundedJobStep, { client: "0x1111111111111111111111111111111111111111", provider, onBalanceRefresh: async () => undefined }));
  assert.match(html, /02 \/ CREATE \+ FUND/);
  assert.match(html, /1\.000000 USDC/);
  assert.match(html, /0x63Fb95A23e81DCf3595c809d9E237eDEFBBB4898/);
  assert.match(html, /ExactMatchScorer/);
  assert.match(html, /supplier-data-extraction/);
});
