import React from "react";
import Link from "next/link";
import { demo } from "../data/demo";
import type { ArcReadResult } from "../lib/arc/read-model";
import { toDemoJob } from "../lib/arc/read-model";
import { formatBps, formatUsdc } from "../lib/ui/format";
import { AddressDisplay, DataReadStatus, StatusBadge } from "./ui";
import { ProviderDecisionCard } from "./providers";

export function OverviewTerminal({data}:{data:ArcReadResult}) {
  const job=toDemoJob(data,demo.verifiedJob);
  const steps=[["Create Policy","Client defines objective eligibility and quality rules."],["Select Provider","Eligible providers are ranked deterministically."],["Measure Result","Committed answers are revealed and scored."],["Settle USDC","Payment is released according to measured quality."]];
  const architecture=[["OFFCHAIN","Client Policy"],["OFFCHAIN","Provider Decision"],["ONCHAIN","VeriqEscrow"],["ONCHAIN","ExactMatchScorer"],["ONCHAIN","PayoutCurve"],["ONCHAIN","USDC Settlement"],["ONCHAIN","Provider History"]];
  return <>
    <section className="overview-hero">
      <div className="hero-editorial"><div className="eyebrow"><span className="pulse"/> Institutional settlement infrastructure</div><h1>Agents get paid for measured results.</h1><p className="hero-copy">Veriq measures completed agent work and settles USDC according to verified quality on Arc.</p><div className="actions"><Link className="button primary" href="/demo">Explore Verified Flow <span aria-hidden>→</span></Link><Link className="button secondary" href="/jobs/1">Inspect Job #1</Link></div><div className="hero-live"><span><i className="pulse"/>Live on Arc</span><span>Arc Testnet</span><AddressDisplay address={demo.deployment.contract} href/></div></div>
      <aside className="terminal-preview" aria-label="Live settlement terminal preview"><header><span>SETTLEMENT / 001</span><span className="success">VERIFIED</span></header><div className="terminal-title"><div><small>JOB</small><strong>#1</strong></div><StatusBadge status={job.status}/></div><dl><div><dt>Quality</dt><dd>{formatBps(job.qualityBps)}</dd></div><div><dt>Payout</dt><dd>{formatBps(job.payoutBps)}</dd></div><div><dt>Provider</dt><dd>{formatUsdc(job.providerPaymentUsdc)}</dd></div><div><dt>Refund</dt><dd>{formatUsdc(job.clientRefundUsdc)}</dd></div></dl><footer><span>ARC TESTNET</span><span>FINALIZED</span></footer></aside>
    </section>
    <section className="overview-section verified-proof" aria-labelledby="verified-example"><div className="overview-heading"><span className="section-kicker">Settlement proof / Job #1</span><h2 id="verified-example">Verified on Arc</h2></div><DataReadStatus data={data}/><div className="proof-grid"><article><strong>{formatBps(job.qualityBps)}</strong><span>Measured quality</span></article><article><strong>{formatBps(job.payoutBps)}</strong><span>Provider payout</span></article><article><strong>{formatUsdc(job.providerPaymentUsdc)}</strong><span>Provider received</span></article><article><strong>{formatUsdc(job.clientRefundUsdc)}</strong><span>Client refunded</span></article><article><strong>{formatUsdc(job.escrowBalanceUsdc)}</strong><span>Escrow remaining</span></article></div></section>
    <section className="overview-section protocol-section" aria-labelledby="how-veriq-works"><div className="overview-heading"><span className="section-kicker">Deterministic lifecycle</span><h2 id="how-veriq-works">How Veriq works</h2></div><ol className="protocol-rail">{steps.map(([title,copy],index)=><li key={title}><span className="step-number">0{index+1}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol></section>
    <section className="overview-section decision-example" aria-labelledby="agent-economics"><div className="overview-heading"><span className="section-kicker">Provider economics</span><h2 id="agent-economics">Agents decide economically.</h2></div><div className="decision-grid">{demo.decisions.map(d=><ProviderDecisionCard key={d.label} example={d}/>)}</div><Link className="text-link" href="/provider-decision">Inspect deterministic logic →</Link></section>
    <section className="overview-section architecture" aria-labelledby="architecture"><div className="overview-heading"><span className="section-kicker">Protocol architecture</span><h2 id="architecture">Proof moves through a clear boundary.</h2></div><ol>{architecture.map(([layer,item])=><li key={item}><small>{layer}</small><strong>{item}</strong></li>)}</ol></section>
  </>;
}
