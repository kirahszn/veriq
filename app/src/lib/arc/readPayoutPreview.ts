import { createPublicClient, http, type Address } from "viem";
import { calculatePayoutUsdc, estimatePayoutBps, validateCurve } from "../payout/estimatePayout";
import { veriqEscrowPayoutPreviewAbi } from "./abi/veriq-escrow-payout-preview";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "./chain";
import { INTERACTIVE_BUDGET, INTERACTIVE_ESCROW_ADDRESS, INTERACTIVE_METRIC_POINTS, INTERACTIVE_PAYOUT_BPS, type PersistedInteractiveJob } from "./interactive-job";

export interface PreviewLiveJob { client:Address;provider:Address;budget:bigint;status:number }
export interface StoredSettlement { qualityBps:bigint;payoutBps:bigint;providerPayment:bigint;clientRefund:bigint;status:number }
export interface PayoutPreviewReader { readJob(jobId:bigint):Promise<PreviewLiveJob>;readStatus(jobId:bigint):Promise<number>;readQualityBps(jobId:bigint):Promise<bigint>;readMetricPoints(jobId:bigint):Promise<readonly bigint[]>;readPayoutPoints(jobId:bigint):Promise<readonly bigint[]>;readSettlementResult(jobId:bigint):Promise<StoredSettlement> }
export interface PayoutPreview { jobId:bigint;qualityBps:number;budget:bigint;metricPoints:readonly number[];payoutPoints:readonly number[];payoutBps:number;providerPayment:bigint;clientRefund:bigint;status:"Ready to Settle" }

export async function calculateLivePayoutPreview(reader:PayoutPreviewReader,state:PersistedInteractiveJob):Promise<PayoutPreview>{
  const jobId=BigInt(state.jobId);
  const [job,status,qualityValue,metricValues,payoutValues,settlement]=await Promise.all([reader.readJob(jobId),reader.readStatus(jobId),reader.readQualityBps(jobId),reader.readMetricPoints(jobId),reader.readPayoutPoints(jobId),reader.readSettlementResult(jobId)]);
  if(job.client===zeroAddress()&&job.provider===zeroAddress()&&status===0)throw new Error("Active job does not exist on Arc.");
  if(job.client.toLowerCase()!==state.client.toLowerCase()||job.provider.toLowerCase()!==state.provider.toLowerCase())throw new Error("Live job parties do not match the active run.");
  if(job.budget!==INTERACTIVE_BUDGET||job.budget.toString()!==state.budget)throw new Error("Live job budget does not match the active run.");
  if(job.status!==status)throw new Error("Live job status reads do not agree.");
  if(status!==4)throw new Error("Active job is no longer Scored.");
  const quality=toSafeNumber(qualityValue,"quality");
  const metricPoints=metricValues.map((value)=>toSafeNumber(value,"metric point"));
  const payoutPoints=payoutValues.map((value)=>toSafeNumber(value,"payout point"));
  validateCurve(metricPoints,payoutPoints);
  if(!same(metricValues,INTERACTIVE_METRIC_POINTS)||!same(payoutValues,INTERACTIVE_PAYOUT_BPS))throw new Error("Live payout curve does not match the interactive policy.");
  if(quality!==9200)throw new Error("Live quality does not match the deterministic scored fixture.");
  if(settlement.status!==4||settlement.qualityBps!==qualityValue)throw new Error("Settlement readback does not match the Scored job.");
  if(settlement.payoutBps!==0n||settlement.providerPayment!==0n||settlement.clientRefund!==0n)throw new Error("Job already contains settlement values.");
  const payoutBps=estimatePayoutBps(metricPoints,payoutPoints,quality);
  const providerPayment=calculatePayoutUsdc(job.budget,payoutBps);
  const clientRefund=job.budget-providerPayment;
  return{jobId,qualityBps:quality,budget:job.budget,metricPoints,payoutPoints,payoutBps,providerPayment,clientRefund,status:"Ready to Settle"};
}

export function createArcPayoutPreviewReader():PayoutPreviewReader{
  const client=createPublicClient({chain:arcTestnet,transport:http(ARC_TESTNET_RPC_URL)}),address=INTERACTIVE_ESCROW_ADDRESS,abi=veriqEscrowPayoutPreviewAbi;
  return{
    async readJob(jobId){const v=await client.readContract({address,abi,functionName:"getJob",args:[jobId]});return{client:v[0],provider:v[1],budget:v[2],status:v[9]}},
    async readStatus(jobId){return await client.readContract({address,abi,functionName:"getStatus",args:[jobId]})},
    async readQualityBps(jobId){return await client.readContract({address,abi,functionName:"getQualityBps",args:[jobId]})},
    async readMetricPoints(jobId){return await client.readContract({address,abi,functionName:"getMetricPoints",args:[jobId]})},
    async readPayoutPoints(jobId){return await client.readContract({address,abi,functionName:"getPayoutBps",args:[jobId]})},
    async readSettlementResult(jobId){const v=await client.readContract({address,abi,functionName:"getSettlementResult",args:[jobId]});return{qualityBps:v[0],payoutBps:v[1],providerPayment:v[2],clientRefund:v[3],status:v[4]}},
  };
}
function toSafeNumber(value:bigint,label:string):number{const result=Number(value);if(!Number.isSafeInteger(result))throw new Error(`Live ${label} is outside the safe integer range.`);return result}
function same(actual:readonly bigint[],expected:readonly bigint[]):boolean{return actual.length===expected.length&&actual.every((value,index)=>value===expected[index])}
function zeroAddress():Address{return"0x0000000000000000000000000000000000000000"}
