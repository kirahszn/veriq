export const veriqEscrowRevealAbi = [
  { type: "function", name: "revealAndScore", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }, { name: "expectedAnswerHashes", type: "bytes32[]" }, { name: "providerAnswerHashes", type: "bytes32[]" }], outputs: [] },
  {
    type: "function", name: "getJob", stateMutability: "view", inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "client", type: "address" }, { name: "provider", type: "address" }, { name: "budget", type: "uint256" },
      { name: "taskSpecHash", type: "bytes32" }, { name: "expectedAnswerCommitment", type: "bytes32" },
      { name: "canonicalizationVersionHash", type: "bytes32" }, { name: "acceptanceDeadline", type: "uint256" },
      { name: "submissionDeadline", type: "uint256" }, { name: "revealDeadline", type: "uint256" }, { name: "status", type: "uint8" },
    ],
  },
  { type: "function", name: "getStatus", stateMutability: "view", inputs: [{ name: "jobId", type: "uint256" }], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "getQualityBps", stateMutability: "view", inputs: [{ name: "jobId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "getResultCommitment", stateMutability: "view", inputs: [{ name: "jobId", type: "uint256" }], outputs: [{ name: "", type: "bytes32" }] },
  { type: "event", name: "JobScored", anonymous: false, inputs: [{ indexed: true, name: "jobId", type: "uint256" }, { indexed: false, name: "qualityBps", type: "uint256" }] },
] as const;
