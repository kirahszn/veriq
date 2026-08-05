export type Address = `0x${string}`;
export type TransactionHash = `0x${string}`;
export type JobStatus = "Funded" | "Accepted" | "Submitted" | "Scored" | "Settled" | "Defaulted";
export interface PayoutPoint { metricBps: number; payoutBps: number }
export interface DemoTransaction { label: string; hash: TransactionHash; timestamp: string }
export interface DemoJob { id:number; taskType:string; provider:Address; client:Address; budgetUsdc:string; correctAnswers:number|null; totalAnswers:number; qualityBps:number|null; payoutBps:number|null; providerPaymentUsdc:string; clientRefundUsdc:string; escrowBalanceUsdc:string; status:JobStatus; createdTime:string; payoutCurve:readonly PayoutPoint[]; deadlines:{acceptance:string;submission:string;reveal:string}; commitments:{evaluation:string;providerResult:string;verified:boolean}; transactions:readonly DemoTransaction[] }
export interface DemoProvider { address:Address; supportedTaskType:string; supportedScorer:string; expectedQualityBps:number; historicalMeasuredQualityBps:number; reliabilityBps:number; expectedCompletionSeconds:number; requestedMaxPaymentUsdc:string; eligible:boolean; rankingScore:number|null; rejectionReasons:readonly string[] }
export interface DecisionExample { label:string; budgetUsdc:string; estimatedQualityBps:number; payoutBps:number; expectedPayoutUsdc:string; executionCostUsdc:string; expectedProfitUsdc:string; minimumProfitUsdc:string; decision:"ACCEPT"|"REJECT"; reason:string }
