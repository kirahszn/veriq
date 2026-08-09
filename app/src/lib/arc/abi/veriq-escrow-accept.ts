export const veriqEscrowAcceptAbi = [
  { type: "function", name: "acceptJob", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }], outputs: [] },
  {
    type: "function", name: "getJob", stateMutability: "view", inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "client", type: "address" }, { name: "provider", type: "address" }, { name: "budget", type: "uint256" },
      { name: "taskSpecHash", type: "bytes32" }, { name: "expectedAnswerCommitment", type: "bytes32" },
      { name: "canonicalizationVersionHash", type: "bytes32" }, { name: "acceptanceDeadline", type: "uint256" },
      { name: "submissionDeadline", type: "uint256" }, { name: "revealDeadline", type: "uint256" }, { name: "status", type: "uint8" },
    ],
  },
  { type: "event", name: "JobAccepted", anonymous: false, inputs: [{ indexed: true, name: "jobId", type: "uint256" }, { indexed: true, name: "provider", type: "address" }] },
] as const;
