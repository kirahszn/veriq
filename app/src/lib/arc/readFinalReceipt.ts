import { createPublicClient, http, type Address, type Hash, type Hex } from "viem";
import { commitAnswers } from "../local-chain/answers";
import { veriqEscrowFinalReceiptAbi } from "./abi/veriq-escrow-final-receipt";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "./chain";
import { INTERACTIVE_BUDGET, INTERACTIVE_ESCROW_ADDRESS, INTERACTIVE_EXPECTED_COMMITMENT, INTERACTIVE_PROVIDER_COMMITMENT, commitExpectedAnswers, type PersistedInteractiveJob } from "./interactive-job";

export interface FinalReceiptJob { client:Address;provider:Address;budget:bigint;expectedAnswerCommitment:Hex;status:number }
export interface FinalReceiptSettlement { qualityBps:bigint;payoutBps:bigint;providerPayment:bigint;clientRefund:bigint;status:number }
export interface FinalReceiptHistory { measuredJobs:bigint;cumulativeQualityBps:bigint;averageQualityBps:bigint;completedJobs:bigint;submissionDefaults:bigint }
export interface FinalReceiptReader { readJob(id:bigint):Promise<FinalReceiptJob>;readStatus(id:bigint):Promise<number>;readQualityBps(id:bigint):Promise<bigint>;readResultCommitment(id:bigint):Promise<Hex>;readSettlementResult(id:bigint):Promise<FinalReceiptSettlement>;readProviderHistory(provider:Address):Promise<FinalReceiptHistory> }
export interface FinalReceipt { jobId:bigint;client:Address;provider:Address;budget:bigint;expectedCommitment:Hex;resultCommitment:Hex;qualityBps:9200;payoutBps:8500;providerPayment:850000n;clientRefund:150000n;history:FinalReceiptHistory;matchCount:number|null;settlementTransactionHash:Hash|null }
export class FinalReceiptUnavailableError extends Error { constructor(public readonly reason:"not-settled"|"invalid",message:string){super(message)} }

export async function readFinalReceipt(reader:FinalReceiptReader,state:PersistedInteractiveJob):Promise<FinalReceipt>{
  const id=BigInt(state.jobId),job=await reader.readJob(id),status=await reader.readStatus(id);
  if(isZero(job.client)&&isZero(job.provider)&&status===0)throw new FinalReceiptUnavailableError("invalid","Active job does not exist on Arc.");
  if(job.status!==status)throw new FinalReceiptUnavailableError("invalid","Live job status reads do not agree.");
  if(status!==5)throw new FinalReceiptUnavailableError("not-settled","Final receipt becomes available after the job is settled on Arc.");
  if(job.client.toLowerCase()!==state.client.toLowerCase())throw invalid("Live client does not match the active run.");
  if(job.provider.toLowerCase()!==state.provider.toLowerCase())throw invalid("Live provider does not match the active run.");
  if(job.budget!==INTERACTIVE_BUDGET||job.budget.toString()!==state.budget)throw invalid("Live budget does not match the active run.");
  const[quality,resultCommitment,settlement,history]=await Promise.all([reader.readQualityBps(id),reader.readResultCommitment(id),reader.readSettlementResult(id),reader.readProviderHistory(job.provider)]);
  if(job.expectedAnswerCommitment!==INTERACTIVE_EXPECTED_COMMITMENT||job.expectedAnswerCommitment!==state.expectedAnswerCommitment)throw invalid("Expected commitment verification failed.");
  if(resultCommitment!==INTERACTIVE_PROVIDER_COMMITMENT)throw invalid("Result commitment verification failed.");
  if(quality!==9200n||settlement.qualityBps!==quality||settlement.payoutBps!==8500n||settlement.providerPayment!==850000n||settlement.clientRefund!==150000n||settlement.status!==5)throw invalid("Live settlement result does not match the verified fixture.");
  if(history.measuredJobs===0n||history.completedJobs===0n||history.averageQualityBps!==history.cumulativeQualityBps/history.measuredJobs)throw invalid("Provider history readback is inconsistent.");
  return{jobId:id,client:job.client,provider:job.provider,budget:job.budget,expectedCommitment:job.expectedAnswerCommitment,resultCommitment,qualityBps:9200,payoutBps:8500,providerPayment:850000n,clientRefund:150000n,history,matchCount:verifiedMatches(state,job.expectedAnswerCommitment,resultCommitment),settlementTransactionHash:validHash(state.settlementTransactionHash)};
}
export function verifiedMatches(state:PersistedInteractiveJob,expected:Hex,result:Hex):number|null{try{const a=state.expectedAnswerHashes,b=state.providerAnswerHashes;if(!a||!b||a.length!==50||b.length!==50)return null;if(commitExpectedAnswers(a)!==expected||commitAnswers(b)!==result)return null;return a.reduce((count,value,index)=>count+(value===b[index]?1:0),0)}catch{return null}}
export function createArcFinalReceiptReader():FinalReceiptReader{const client=createPublicClient({chain:arcTestnet,transport:http(ARC_TESTNET_RPC_URL)}),address=INTERACTIVE_ESCROW_ADDRESS,abi=veriqEscrowFinalReceiptAbi;return{async readJob(id){const v=await client.readContract({address,abi,functionName:"getJob",args:[id]});return{client:v[0],provider:v[1],budget:v[2],expectedAnswerCommitment:v[4],status:v[9]}},async readStatus(id){return client.readContract({address,abi,functionName:"getStatus",args:[id]})},async readQualityBps(id){return client.readContract({address,abi,functionName:"getQualityBps",args:[id]})},async readResultCommitment(id){return client.readContract({address,abi,functionName:"getResultCommitment",args:[id]})},async readSettlementResult(id){const v=await client.readContract({address,abi,functionName:"getSettlementResult",args:[id]});return{qualityBps:v[0],payoutBps:v[1],providerPayment:v[2],clientRefund:v[3],status:v[4]}},async readProviderHistory(provider){const v=await client.readContract({address,abi,functionName:"getProviderHistory",args:[provider]});return{measuredJobs:v[0],cumulativeQualityBps:v[1],averageQualityBps:v[2],completedJobs:v[3],submissionDefaults:v[4]}}}}
function invalid(message:string){return new FinalReceiptUnavailableError("invalid",message)}
function isZero(value:Address){return value.toLowerCase()==="0x0000000000000000000000000000000000000000"}
function validHash(value:Hash|null|undefined):Hash|null{return value&&/^0x[0-9a-f]{64}$/i.test(value)?value:null}
