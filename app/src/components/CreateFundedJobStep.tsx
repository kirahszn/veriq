"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { ARC_TESTNET_EXPLORER_URL } from "../lib/arc/chain";
import {
  INTERACTIVE_BUDGET,
  INTERACTIVE_PROVIDER_ADDRESS,
  INTERACTIVE_SCORER,
  INTERACTIVE_STORAGE_KEY,
  INTERACTIVE_TASK_TYPE,
  parsePersistedInteractiveJob,
  serializeInteractiveJob,
  type PersistedInteractiveJob,
} from "../lib/arc/interactive-job";
import { createBrowserJobAdapter, executeCreateFundedJob, validatePersistedJob, type CreateFundedJobPhase } from "../lib/wallet/createFundedJob";
import type { InjectedProvider } from "../lib/wallet/injectedWallet";
import { AddressDisplay } from "./ui";

const phaseLabels: Record<CreateFundedJobPhase, string> = {
  "checking-balance": "Checking USDC balance",
  "checking-allowance": "Checking allowance",
  "approval-required": "Approval required",
  "awaiting-approval": "Awaiting approval",
  "approval-confirmed": "Approval confirmed",
  "creating-job": "Creating job",
  "waiting-confirmation": "Waiting for Arc confirmation",
  "confirming-funded": "Confirming funded state",
};

export function CreateFundedJobStep({ client, provider, onBalanceRefresh }: { client: Address; provider: InjectedProvider; onBalanceRefresh: () => Promise<void> }) {
  const [phase, setPhase] = useState<CreateFundedJobPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [funded, setFunded] = useState<PersistedInteractiveJob | null>(null);
  const [restoring, setRestoring] = useState(false);
  const adapter = useMemo(() => createBrowserJobAdapter(provider), [provider]);

  useEffect(() => {
    let active = true;
    const persisted = parsePersistedInteractiveJob(localStorage.getItem(INTERACTIVE_STORAGE_KEY));
    if (!persisted || persisted.client.toLowerCase() !== client.toLowerCase()) return;
    setRestoring(true);
    void validatePersistedJob(persisted).then(valid => {
      if (!active) return;
      if (valid) setFunded(persisted);
      else setError("A saved job was found but could not be confirmed as Funded on Arc.");
    }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [client]);

  async function createAndFund() {
    setError(null);
    setPhase("checking-balance");
    try {
      const result = await executeCreateFundedJob(adapter, client, setPhase);
      setFunded(result.persisted);
      setPhase(null);
      try { localStorage.setItem(INTERACTIVE_STORAGE_KEY, serializeInteractiveJob(result.persisted)); }
      catch { setError("Job confirmed on Arc, but its public recovery state could not be saved in this browser."); }
      await onBalanceRefresh();
    } catch (cause) {
      setPhase(null);
      setError(safeUiError(cause));
    }
  }

  return <section className="execution-panel panel execution-create" aria-live="polite">
    <header className="execution-step"><span>02 / CREATE + FUND</span><p>Create a fixed-policy job and atomically fund its Arc escrow.</p></header>
    {!funded ? <>
      <dl className="execution-metadata execution-policy">
        <div><dt>Budget</dt><dd>1.000000 USDC</dd></div>
        <div><dt>Provider</dt><dd><AddressDisplay address={INTERACTIVE_PROVIDER_ADDRESS}/></dd></div>
        <div><dt>Scorer</dt><dd>{INTERACTIVE_SCORER}</dd></div>
        <div><dt>Task</dt><dd>{INTERACTIVE_TASK_TYPE}</dd></div>
      </dl>
      <div className="execution-action">
        <button className="button primary" type="button" onClick={createAndFund} disabled={phase !== null || restoring}>
          {restoring ? "Validating saved job…" : phase ? phaseLabels[phase] : "Create & Fund Job"}
        </button>
        {phase && <span className="execution-progress">{phaseLabels[phase]}</span>}
        {error && <p className="execution-error" role="alert">{error}</p>}
      </div>
    </> : <>
      <dl className="execution-metadata execution-result">
        <div><dt>Job ID</dt><dd>#{funded.jobId}</dd></div>
        <div><dt>Status</dt><dd className="success">Funded</dd></div>
        <div><dt>Budget</dt><dd>{formatBudget(INTERACTIVE_BUDGET)} USDC</dd></div>
        <div><dt>Client</dt><dd><AddressDisplay address={funded.client}/></dd></div>
        <div><dt>Provider</dt><dd><AddressDisplay address={funded.provider}/></dd></div>
        <div><dt>Transaction</dt><dd><a className="tx-link" href={`${ARC_TESTNET_EXPLORER_URL}/tx/${funded.createTransactionHash}`} target="_blank" rel="noreferrer">{funded.createTransactionHash.slice(0,10)}…{funded.createTransactionHash.slice(-6)}<span aria-hidden>↗</span></a></dd></div>
      </dl>
      <p className="execution-confirmed"><span aria-hidden>✓</span> Confirmed on Arc</p>
      {error && <p className="execution-error" role="alert">{error}</p>}
    </>}
  </section>;
}

function formatBudget(value: bigint): string { return `${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, "0")}`; }
function safeUiError(value: unknown): string {
  const message = value instanceof Error ? value.message : "Create and fund failed.";
  if (/rejected|denied|4001/i.test(message)) return "The wallet request was rejected.";
  return message.replace(/https?:\/\/\S+/gi, "[RPC]").slice(0, 220);
}
