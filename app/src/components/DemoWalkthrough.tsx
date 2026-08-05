"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { DemoPresentation } from "../data/demo-stages";
import { nextDemoStage, normalizeDemoStage, previousDemoStage, restartDemo } from "../data/demo-stages";
import { ARC_TESTNET_EXPLORER_URL } from "../lib/arc/chain";

export function DemoWalkthrough({presentation,initialStage=1}:{presentation:DemoPresentation;initialStage?:number}) {
  const [current,setCurrent]=useState(()=>normalizeDemoStage(initialStage));
  const stage=presentation.stages[current-1]??presentation.stages[0];
  const sourceLabel=presentation.rpcState==="Data mismatch"?"Data mismatch":presentation.source==="LIVE"?"Live on Arc":"Verified fallback";
  const move=(next:number)=>setCurrent(normalizeDemoStage(next));
  return <div className="demo-route" onKeyDown={event=>{if(event.key==="ArrowLeft")move(previousDemoStage(current));if(event.key==="ArrowRight")move(nextDemoStage(current))}}>
    <header className="demo-header">
      <div><span className="section-kicker">Guided lifecycle walkthrough</span><h1>Veriq Protocol Demo</h1><p>Follow the verified Job #1 lifecycle without a wallet, signature, or new transaction.</p></div>
      <div className="demo-badges" aria-label="Demo status"><span className="network-badge"><span className="pulse"/>Arc Testnet</span><span className="static-label">Read-only demo</span><span className={`read-source ${presentation.source==="VERIFIED_FALLBACK"?"fallback":""}`}>{sourceLabel}</span><span className="status status-settled"><span aria-hidden>●</span>{presentation.status}</span></div>
      <small>Last checked <time dateTime={presentation.fetchedAt}>{new Date(presentation.fetchedAt).toLocaleString("en-GB",{timeZone:"UTC"})} UTC</time></small>
    </header>
    {presentation.source==="VERIFIED_FALLBACK"&&<p className="demo-warning" role="alert">Arc RPC is temporarily unavailable. The walkthrough is using the verified Milestone 13B result.</p>}
    {presentation.rpcState==="Data mismatch"&&<div className="demo-warning" role="alert"><strong>Live contract state differs from the previously verified result.</strong>{presentation.warnings.map(w=><p key={w}>{w}</p>)}</div>}
    <nav className="demo-progress" aria-label="Demo lifecycle stages">{presentation.stages.map(item=><button key={item.id} type="button" className={`demo-progress-step completed ${item.id===current?"current":""}`} aria-current={item.id===current?"step":undefined} aria-label={`Stage ${item.id}: ${item.name}, completed${item.id===current?", current stage":""}`} onClick={()=>move(item.id)}><span className="demo-step-number">{item.id}</span><span>{item.name}</span><small>Completed</small></button>)}</nav>
    <main className="demo-stage-panel" tabIndex={-1}>
      <div className="demo-stage-heading"><div><span className="section-kicker">Stage {stage.id} of 11</span><h2>{stage.name}</h2><p>{stage.summary}</p></div><div className="demo-stage-meta"><span><b>Responsible role</b>{stage.role}</span><span><b>Happened</b>{stage.location}</span></div></div>
      <dl className="demo-values">{stage.rows.map(row=><div key={`${row.label}-${row.value}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
      <ul className="demo-explanation">{stage.bullets.map(item=><li key={item}>{item}</li>)}</ul>
      {stage.transaction&&<div className="demo-transaction"><span>Verified Milestone 13B transaction reference.</span><a href={`${ARC_TESTNET_EXPLORER_URL}/tx/${stage.transaction.hash}`} target="_blank" rel="noreferrer" aria-label={`Open verified Milestone 13B ${stage.name} transaction reference on ArcScan`}>{stage.transaction.hash}<span aria-hidden> ↗</span></a></div>}
      {!stage.transaction&&stage.location!=="Offchain"&&<p className="muted">No separate transaction reference is required for this presentation stage.</p>}
    </main>
    <div className="demo-controls" aria-label="Demo navigation controls"><button type="button" onClick={()=>move(previousDemoStage(current))} disabled={current===1}>Previous step</button><button type="button" onClick={()=>move(nextDemoStage(current))} disabled={current===11}>Next step</button><button type="button" onClick={()=>move(restartDemo())}>Restart demo</button><Link className="button secondary" href="/jobs/1">View verified Job #1</Link>{stage.transaction&&<a className="button secondary" href={`${ARC_TESTNET_EXPLORER_URL}/tx/${stage.transaction.hash}`} target="_blank" rel="noreferrer">Open transaction reference</a>}</div>
    <section className="demo-conclusion panel" aria-label="Verified demo conclusion"><span className="section-kicker">Verified conclusion</span><h2>Quality measured. Proportional USDC settled.</h2><div>{presentation.conclusion.map(item=><article key={item.label}><span>{item.label}</span><strong>{item.value}</strong></article>)}</div></section>
  </div>;
}
