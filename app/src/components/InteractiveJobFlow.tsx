"use client";
import React, { useEffect, useState } from "react";
import type { Address } from "viem";
import { INTERACTIVE_STORAGE_KEY, parsePersistedInteractiveJob, serializeInteractiveJob, type PersistedInteractiveJob } from "../lib/arc/interactive-job";
import { recoverInteractiveJob } from "../lib/wallet/acceptFundedJob";
import type { InjectedProvider } from "../lib/wallet/injectedWallet";
import { CreateFundedJobStep } from "./CreateFundedJobStep";
import { ProviderAcceptStep } from "./ProviderAcceptStep";
export type InteractiveRole = "Client" | "Provider" | "Unrelated wallet";
export function InteractiveJobFlow({account,provider,onRoleChange,onBalanceRefresh}:{account:Address;provider:InjectedProvider;onRoleChange:(role:InteractiveRole)=>void;onBalanceRefresh:()=>Promise<void>}){
  const [job,setJob]=useState<PersistedInteractiveJob|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);
  useEffect(()=>{let active=true;const saved=parsePersistedInteractiveJob(localStorage.getItem(INTERACTIVE_STORAGE_KEY));if(!saved){setLoading(false);onRoleChange("Client");return}setLoading(true);setError(null);void recoverInteractiveJob(saved).then(recovered=>{if(!active)return;setJob(recovered);try{localStorage.setItem(INTERACTIVE_STORAGE_KEY,serializeInteractiveJob(recovered))}catch{}onRoleChange(roleFor(account,recovered))}).catch(()=>{if(active){setError("Saved Job #2 could not be verified on Arc. Actions remain disabled.");onRoleChange("Unrelated wallet")}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[account,onRoleChange]);
  function updateJob(next:PersistedInteractiveJob){setJob(next);try{localStorage.setItem(INTERACTIVE_STORAGE_KEY,serializeInteractiveJob(next))}catch{}onRoleChange(roleFor(account,next))}
  if(loading)return <div className="state-card"><strong>Validating interactive job</strong><span>Reading Arc state before enabling actions.</span></div>;
  if(error)return <div className="state-card error" role="alert"><strong>Interactive job unavailable</strong><span>{error}</span></div>;
  return <><CreateFundedJobStep client={account} provider={provider} onBalanceRefresh={onBalanceRefresh} activeJob={job} onJobFunded={updateJob}/>{job&&<ProviderAcceptStep account={account} provider={provider} job={job} onAccepted={updateJob}/>}</>;
}
function roleFor(account:Address,job:PersistedInteractiveJob):InteractiveRole{if(account.toLowerCase()===job.client.toLowerCase())return "Client";if(account.toLowerCase()===job.provider.toLowerCase())return "Provider";return "Unrelated wallet"}
