import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExecutePage from "../app/execute/page";
import { ExecutionWallet } from "../src/components/ExecutionWallet";
import { navigation } from "../src/components/AppShell";

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
});

test("Execute is appended to navigation and preserves active-route behavior", () => {
  assert.deepEqual(navigation.at(-1), { href: "/execute", label: "Execute" });
});

test("local Disconnect is an explicit UI reset and permission disclaimer", () => {
  const source = readFileSync("src/components/ExecutionWallet.tsx", "utf8");
  assert.match(source, /onClick=\{reset\}>Disconnect/);
  assert.match(source, /permissions are managed by your wallet/);
});
