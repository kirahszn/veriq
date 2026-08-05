import { encodeAbiParameters, keccak256, stringToHex, type Hex } from "viem";

export function buildAnswerFixtures(): { expected: Hex[]; provider: Hex[]; expectedCommitment: Hex; providerCommitment: Hex } {
  const expected = Array.from({ length: 50 }, (_, index) => keccak256(stringToHex(`expected-${index}`)));
  const provider = expected.map((hash, index) => index < 46 ? hash : keccak256(stringToHex(`provider-${index}`)));
  return { expected, provider, expectedCommitment: commitAnswers(expected), providerCommitment: commitAnswers(provider) };
}

export function commitAnswers(answers: readonly Hex[]): Hex {
  if (answers.length !== 50) throw new Error("Exactly 50 answer hashes are required");
  return keccak256(encodeAbiParameters([{ type: "bytes32[]" }], [answers]));
}
