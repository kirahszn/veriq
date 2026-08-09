export const veriqEscrowExecuteAbi = [
  {
    type: "function", name: "createJob", stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" }, { name: "budget", type: "uint256" },
      { name: "taskSpecHash", type: "bytes32" }, { name: "expectedAnswerCommitment", type: "bytes32" },
      { name: "canonicalizationVersionHash", type: "bytes32" }, { name: "acceptanceDeadline", type: "uint256" },
      { name: "submissionDeadline", type: "uint256" }, { name: "revealDeadline", type: "uint256" },
      { name: "metricPoints", type: "uint256[]" }, { name: "payoutBps", type: "uint256[]" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
  },
  {
    type: "function", name: "getJob", stateMutability: "view", inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "client", type: "address" }, { name: "provider", type: "address" }, { name: "budget", type: "uint256" },
      { name: "taskSpecHash", type: "bytes32" }, { name: "expectedAnswerCommitment", type: "bytes32" },
      { name: "canonicalizationVersionHash", type: "bytes32" }, { name: "acceptanceDeadline", type: "uint256" },
      { name: "submissionDeadline", type: "uint256" }, { name: "revealDeadline", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "event", name: "JobCreated", anonymous: false,
    inputs: [
      { indexed: true, name: "jobId", type: "uint256" }, { indexed: true, name: "client", type: "address" },
      { indexed: true, name: "provider", type: "address" }, { indexed: false, name: "budget", type: "uint256" },
    ],
  },
] as const;
