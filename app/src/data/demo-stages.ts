import { demo } from "./demo";
import type { ArcReadResult } from "../lib/arc/read-model";
import { formatUsdcBaseUnits } from "../lib/arc/read-model";

export type DemoLocation = "Offchain" | "Onchain" | "Both";
export interface DemoStage {
  id: number;
  name: string;
  role: string;
  location: DemoLocation;
  summary: string;
  rows: readonly { label: string; value: string }[];
  bullets: readonly string[];
  transaction?: { label: string; hash: string };
}
export interface DemoPresentation {
  source: ArcReadResult["source"];
  rpcState: ArcReadResult["rpcState"];
  fetchedAt: string;
  status: string;
  warnings: readonly string[];
  stages: readonly DemoStage[];
  conclusion: readonly { label: string; value: string }[];
}

const tx = demo.verifiedJob.transactions;
const reference = (index:number) => ({ label:"Verified Milestone 13B transaction reference.", hash:tx[index].hash });

export function buildDemoPresentation(read: ArcReadResult): DemoPresentation {
  const job=read.job,history=read.providerHistory;
  const stages:readonly DemoStage[]=[
    {id:1,name:"Client policy",role:"Client agent",location:"Offchain",summary:"A deterministic offchain policy defines which providers may be considered.",rows:[{label:"Required task type",value:demo.selectionPolicy.taskType},{label:"Required scorer",value:demo.selectionPolicy.scorer},{label:"Maximum budget",value:"200 USDC"},{label:"Minimum historical quality",value:"80%"},{label:"Minimum reliability",value:"85%"},{label:"Maximum completion time",value:"5 minutes"}],bullets:["Deterministic offchain policy.","Not stored in VeriqEscrow."]},
    {id:2,name:"Provider selection",role:"Client agent",location:"Offchain",summary:"Deterministic rules rank eligible provider fixtures without an LLM.",rows:demo.providers.map((p,i)=>({label:`Provider ${i+1}${i===0?" · selected":""}`,value:`${p.eligible?"Eligible":"Rejected"} · weighted score ${p.rankingScore??"n/a"}`})),bullets:["Selected provider: 0x1111…1111.","Rejected provider reason: Task type is not supported.","Selection happened offchain and was not read from the contract."]},
    {id:3,name:"Provider decision",role:"Provider agent",location:"Offchain",summary:"The provider independently applies deterministic profitability rules.",rows:[{label:"Profitable case",value:"200 USDC · 92% quality · 85% payout · 170 USDC expected payout"},{label:"Execution economics",value:"22 USDC cost · 148 USDC expected profit · 30 USDC minimum"},{label:"Decision",value:"ACCEPT"},{label:"Unprofitable fixture",value:"60 USDC · 82% quality · 48% payout · 28.80 USDC expected payout"},{label:"Unprofitable economics",value:"22 USDC cost · 6.80 USDC expected profit · 30 USDC minimum"},{label:"Fixture decision",value:"REJECT"}],bullets:["Deterministic offchain profitability logic.","Not stored onchain."]},
    {id:4,name:"Job funded",role:"Client agent",location:"Onchain",summary:"The verified client funded Job #1 through VeriqEscrow on Arc Testnet.",rows:[{label:"Budget",value:`${formatUsdcBaseUnits(job.budget)} USDC`},{label:"Client",value:job.client},{label:"Provider",value:job.provider},{label:"Contract",value:read.contractAddress},{label:"Resulting status",value:"Funded"}],bullets:["Verified Job #1 onchain stage."],transaction:reference(0)},
    {id:5,name:"Provider accepted",role:"Provider agent",location:"Onchain",summary:"The selected provider accepted the funded job onchain.",rows:[{label:"Selected provider",value:job.provider},{label:"Action",value:"Accepted funded Job #1"},{label:"Resulting status",value:"Accepted"}],bullets:["Acceptance was recorded by VeriqEscrow."],transaction:reference(1)},
    {id:6,name:"Result committed",role:"Provider agent",location:"Both",summary:"The provider committed to its ordered 50-answer array before reveal.",rows:[{label:"Commitment encoding",value:"keccak256(abi.encode(answerHashes))"},{label:"Provider commitment",value:String(job.providerCommitment)},{label:"Resulting status",value:"Submitted"}],bullets:["The ordered array contained exactly 50 answer hashes.","The commitment became immutable before reveal.","Private answers and secrets are not displayed."],transaction:reference(2)},
    {id:7,name:"Answers revealed",role:"Client agent",location:"Onchain",summary:"Both ordered answer-hash arrays were revealed and checked against their commitments.",rows:[{label:"Expected answers",value:"Exactly 50 hashes"},{label:"Provider answers",value:"Exactly 50 hashes"},{label:"Integrity",value:"Both commitments verified"}],bullets:["Modified or reordered arrays would fail commitment verification.","No private answer content is shown."],transaction:reference(3)},
    {id:8,name:"Exact-match scoring",role:"Veriq protocol",location:"Onchain",summary:"The internal pure ExactMatchScorer measured objective equality.",rows:[{label:"Exact matches",value:"46/50"},{label:"qualityBps",value:`${job.qualityBps}`},{label:"Measured quality",value:`${job.qualityBps/100}%`},{label:"Scorer",value:"Canonical exact match"}],bullets:["No subjective human review.","No approximate, fuzzy, semantic, or LLM matching."],transaction:reference(3)},
    {id:9,name:"Payout calculation",role:"Veriq protocol",location:"Onchain",summary:"The existing payout-curve implementation interpolated quality into payment.",rows:[{label:"Curve point 1",value:"70% quality → 0% payout"},{label:"Curve point 2",value:"90% quality → 80% payout"},{label:"Curve point 3",value:"98% quality → 100% payout"},{label:"Verified result",value:`${job.qualityBps/100}% quality → ${job.payoutBps/100}% payout`},{label:"payoutBps",value:`${job.payoutBps}`}],bullets:["Interpolation produced 8500 payout basis points.","The demo does not duplicate or replace protocol calculation logic."]},
    {id:10,name:"USDC settlement",role:"Veriq protocol",location:"Onchain",summary:"Arc settled the proportional payment and returned the unused budget.",rows:[{label:"Budget",value:`${formatUsdcBaseUnits(job.budget)} USDC`},{label:"Provider payment",value:`${formatUsdcBaseUnits(job.providerPayment)} USDC`},{label:"Client refund",value:`${formatUsdcBaseUnits(job.clientRefund)} USDC`},{label:"Escrow final balance",value:`${formatUsdcBaseUnits(read.balances.escrow)} USDC`},{label:"Final status",value:job.status},{label:"Accounting",value:"provider payment + client refund = budget"}],bullets:["Current wallet balances are not used to infer historical settlement."],transaction:reference(4)},
    {id:11,name:"Provider history",role:"Veriq protocol",location:"Onchain",summary:"The measured settlement updated objective provider history.",rows:[{label:"measuredJobs",value:String(history.measuredJobs)},{label:"cumulativeQualityBps",value:String(history.cumulativeQualityBps)},{label:"averageQualityBps",value:String(history.averageQualityBps)},{label:"completedJobs",value:String(history.completedJobs)},{label:"submissionDefaults",value:String(history.submissionDefaults)}],bullets:["Normal measured settlements affect measured average.","Client-reveal defaults do not create fake quality.","Submission defaults are tracked separately.","Acceptance expiry does not change provider history."]}
  ];
  return {source:read.source,rpcState:read.rpcState,fetchedAt:read.fetchedAt,status:job.status,warnings:[...read.warnings],stages,conclusion:[{label:"Quality measured",value:"92%"},{label:"Provider payout",value:"85%"},{label:"Provider received",value:"0.85 USDC"},{label:"Client refund",value:"0.15 USDC"},{label:"Escrow remaining",value:"0 USDC"},{label:"Provider history",value:"Updated"},{label:"Final status",value:"Settled"}]};
}

export function normalizeDemoStage(value:unknown):number { const number=typeof value==="number"?value:Number(value);return Number.isInteger(number)&&number>=1&&number<=11?number:1 }
export const previousDemoStage=(value:unknown)=>Math.max(1,normalizeDemoStage(value)-1);
export const nextDemoStage=(value:unknown)=>Math.min(11,normalizeDemoStage(value)+1);
export const restartDemo=()=>1;
