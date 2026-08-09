"use client";
import React, { useEffect, useState } from "react";
import type { Address } from "viem";
import { INTERACTIVE_STORAGE_KEY, parsePersistedInteractiveJob, serializeInteractiveJob, type PersistedInteractiveJob } from "../lib/arc/interactive-job";
import { recoverInteractiveJob } from "../lib/wallet/acceptFundedJob";
import type { InjectedProvider } from "../lib/wallet/injectedWallet";
import { CreateFundedJobStep } from "./CreateFundedJobStep";
import { ProviderAcceptStep } from "./ProviderAcceptStep";
import { ProviderCommitStep } from "./ProviderCommitStep";
import { RevealScoreStep } from "./RevealScoreStep";
import { PayoutCalculationStep } from "./PayoutCalculationStep";
import { SettleUsdcStep } from "./SettleUsdcStep";
import { FinalSettlementReceipt } from "./FinalSettlementReceipt";
export type InteractiveRole = "Client" | "Provider" | "Unrelated wallet";
export interface InteractiveStorage { removeItem(key:string):void }
export function clearActiveInteractiveRun(storage:InteractiveStorage):void{storage.removeItem(INTERACTIVE_STORAGE_KEY)}
export function ActiveRunReset({onReset}:{onReset:()=>void}){return <section className="execution-panel panel"><div className="execution-action"><div><strong>Active interactive run</strong><p className="execution-note">Clears this browser’s active Veriq run only. Onchain jobs remain unchanged.</p></div><button className="button secondary" type="button" onClick={onReset}>Start New Run</button></div></section>}
export function InteractiveJobFlow({account,provider,onRoleChange,onBalanceRefresh}:{account:Address;provider:InjectedProvider;onRoleChange:(role:InteractiveRole)=>void;onBalanceRefresh:()=>Promise<void>}){
  const [job,setJob]=useState<PersistedInteractiveJob|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);
  useEffect(()=>{let active=true;const saved=parsePersistedInteractiveJob(localStorage.getItem(INTERACTIVE_STORAGE_KEY));if(!saved){setLoading(false);onRoleChange("Client");return}setLoading(true);setError(null);void recoverInteractiveJob(saved).then(recovered=>{if(!active)return;setJob(recovered);try{localStorage.setItem(INTERACTIVE_STORAGE_KEY,serializeInteractiveJob(recovered))}catch{}onRoleChange(roleFor(account,recovered))}).catch(()=>{if(active){setError(`Saved Job #${saved.jobId} could not be verified on Arc. Actions remain disabled.`);onRoleChange("Unrelated wallet")}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[account,onRoleChange]);
  function updateJob(next:PersistedInteractiveJob){setJob(next);try{localStorage.setItem(INTERACTIVE_STORAGE_KEY,serializeInteractiveJob(next))}catch{}onRoleChange(roleFor(account,next))}
  function startNewRun(){clearActiveInteractiveRun(localStorage);setJob(null);setError(null);setLoading(false);onRoleChange("Client")}
  if(loading)return <div className="state-card"><strong>Validating interactive job</strong><span>Reading Arc state before enabling actions.</span></div>;
  if(error)return <><ActiveRunReset onReset={startNewRun}/><div className="state-card error" role="alert"><strong>Interactive job unavailable</strong><span>{error}</span></div></>;
  return <>{job&&<ActiveRunReset onReset={startNewRun}/>}<CreateFundedJobStep client={account} provider={provider} onBalanceRefresh={onBalanceRefresh} activeJob={job} onJobFunded={updateJob}/>{job&&<ProviderAcceptStep account={account} provider={provider} job={job} onAccepted={updateJob}/>} {job&&["Accepted","Submitted","Scored","Settled"].includes(job.status)&&<ProviderCommitStep account={account} provider={provider} job={job} onCommitted={updateJob}/>} {job&&["Submitted","Scored","Settled"].includes(job.status)&&<RevealScoreStep account={account} provider={provider} job={job} onScored={updateJob}/>} {job&&["Scored","Settled"].includes(job.status)&&<PayoutCalculationStep job={job}/>} {job&&["Scored","Settled"].includes(job.status)&&<SettleUsdcStep account={account} provider={provider} job={job} onSettled={updateJob}/>} {job&&<FinalSettlementReceipt job={job}/>}</>;
}
function roleFor(account:Address,job:PersistedInteractiveJob):InteractiveRole{if(account.toLowerCase()===job.client.toLowerCase())return "Client";if(account.toLowerCase()===job.provider.toLowerCase())return "Provider";return "Unrelated wallet"}
