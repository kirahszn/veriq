import type { Address, DemoJob, DemoProvider, DecisionExample, TransactionHash } from "./types";

const address = (value:string)=>value as Address;
const tx = (value:string)=>value as TransactionHash;
export const demo = {
  deployment: Object.freeze({ network:"Arc Testnet", chainId:5042002, explorerBase:"https://testnet.arcscan.app", contract:address("0xd7bc6d86afcf8f4fdc02e990222951978afd311b"), usdc:address("0x3600000000000000000000000000000000000000"), deploymentTransaction:tx("0x253a828ec6f19b90e058f53a905ce50e023aca990918945119f564aa907f2f15") }),
  verifiedJob: Object.freeze({ id:1, taskType:"Supplier data extraction", client:address("0xd55692a56f3ff2fEC95b0F4547C98D140469D95C"), provider:address("0xA6Bd2273219904699B67Fb64988a32249dFEc241"), budgetUsdc:"1", correctAnswers:46, totalAnswers:50, qualityBps:9200, payoutBps:8500, providerPaymentUsdc:"0.85", clientRefundUsdc:"0.15", escrowBalanceUsdc:"0", status:"Settled", createdTime:"05 Aug 2026 · 00:40 UTC", payoutCurve:Object.freeze([{metricBps:7000,payoutBps:0},{metricBps:9000,payoutBps:8000},{metricBps:9800,payoutBps:10000}]), deadlines:Object.freeze({acceptance:"05 Aug 2026 · 01:40 UTC",submission:"05 Aug 2026 · 02:40 UTC",reveal:"05 Aug 2026 · 03:40 UTC"}), commitments:Object.freeze({evaluation:"keccak256(abi.encode(expectedAnswerHashes))",providerResult:"keccak256(abi.encode(providerAnswerHashes))",verified:true}), transactions:Object.freeze([
    {label:"Job funded",hash:tx("0xd8ed7b8dd8b148a41e6089ef64b7b7f75b00f336f82b29c03d77f24b9b3f22dc"),timestamp:"00:40:38 UTC"},
    {label:"Provider accepted",hash:tx("0x26005d8bb404418ea2e3aa296d7e4153610245510dd8d02c60179364847490dd"),timestamp:"00:40:40 UTC"},
    {label:"Result committed",hash:tx("0x7eaa11ee8ab9306885321b3316116af358eafdacd9b434f9f7b1b9250faba507"),timestamp:"00:40:42 UTC"},
    {label:"Answers revealed & scored",hash:tx("0xbb7cf8aa2c558be07f7af148ddb4aef3768bc06899f3c65ddc6f3d7af73cf3af"),timestamp:"00:40:45 UTC"},
    {label:"Settlement complete",hash:tx("0xf3c9ab9da0e10aa9f2a2af82255c1a319c790eb4c4504180e6ce21a9624817c5"),timestamp:"00:40:48 UTC"}
  ]) }) satisfies DemoJob,
  jobs: Object.freeze([]) as readonly DemoJob[],
  providers: Object.freeze([
    {address:address("0x1111111111111111111111111111111111111111"),supportedTaskType:"supplier-data-extraction",supportedScorer:"ExactMatchScorer",expectedQualityBps:9400,historicalMeasuredQualityBps:9500,reliabilityBps:9700,expectedCompletionSeconds:180,requestedMaxPaymentUsdc:"200",eligible:true,rankingScore:908500,rejectionReasons:[]},
    {address:address("0x2222222222222222222222222222222222222222"),supportedTaskType:"supplier-data-extraction",supportedScorer:"ExactMatchScorer",expectedQualityBps:8500,historicalMeasuredQualityBps:8800,reliabilityBps:9100,expectedCompletionSeconds:120,requestedMaxPaymentUsdc:"150",eligible:true,rankingScore:835000,rejectionReasons:[]},
    {address:address("0x3333333333333333333333333333333333333333"),supportedTaskType:"document-summarization",supportedScorer:"ExactMatchScorer",expectedQualityBps:9900,historicalMeasuredQualityBps:9800,reliabilityBps:9900,expectedCompletionSeconds:90,requestedMaxPaymentUsdc:"180",eligible:false,rankingScore:null,rejectionReasons:["Task type is not supported."]}
  ]) satisfies readonly DemoProvider[],
  selectionPolicy: Object.freeze({ taskType:"supplier-data-extraction", scorer:"ExactMatchScorer", maximumBudgetUsdc:"200", minimumHistoricalQualityBps:8000, minimumReliabilityBps:8500, maximumCompletionSeconds:300, formula:"Expected quality × 35% + historical quality × 30% + reliability × 25% + completion score × 10%" }),
  decisions: Object.freeze([
    {label:"Profitable verified work",budgetUsdc:"200",estimatedQualityBps:9200,payoutBps:8500,expectedPayoutUsdc:"170.00",executionCostUsdc:"22.00",expectedProfitUsdc:"148.00",minimumProfitUsdc:"30.00",decision:"ACCEPT",reason:"Expected profit meets or exceeds the minimum required profit."},
    {label:"Unprofitable fixture",budgetUsdc:"60",estimatedQualityBps:8200,payoutBps:4800,expectedPayoutUsdc:"28.80",executionCostUsdc:"22.00",expectedProfitUsdc:"6.80",minimumProfitUsdc:"30.00",decision:"REJECT",reason:"Expected profit is below the minimum required profit."}
  ]) satisfies readonly DecisionExample[],
  providerHistory:Object.freeze({measuredJobs:1,cumulativeQualityBps:9200,averageQualityBps:9200,completedJobs:1,submissionDefaults:0})
};
(demo as { jobs: readonly DemoJob[] }).jobs = Object.freeze([demo.verifiedJob,
  { ...demo.verifiedJob,id:2,status:"Submitted",budgetUsdc:"120",qualityBps:null,payoutBps:null,correctAnswers:null,providerPaymentUsdc:"—",clientRefundUsdc:"—",escrowBalanceUsdc:"120",createdTime:"04 Aug 2026 · 18:12 UTC",transactions:[] },
  { ...demo.verifiedJob,id:3,status:"Funded",budgetUsdc:"80",qualityBps:null,payoutBps:null,correctAnswers:null,providerPaymentUsdc:"—",clientRefundUsdc:"—",escrowBalanceUsdc:"80",createdTime:"04 Aug 2026 · 16:44 UTC",transactions:[] },
  { ...demo.verifiedJob,id:4,status:"Defaulted",budgetUsdc:"60",qualityBps:null,payoutBps:null,correctAnswers:null,providerPaymentUsdc:"0",clientRefundUsdc:"60",escrowBalanceUsdc:"0",createdTime:"03 Aug 2026 · 09:30 UTC",transactions:[] }
]);
Object.freeze(demo);
