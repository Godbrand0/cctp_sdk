import { parseAbi } from "viem";

export const TOKEN_MESSENGER_ABI = parseAbi([
  // CCTP v2: 7-arg form — destinationCaller=bytes32(0) means any relayer can relay
  // minFinalityThreshold: 0 = standard (~20 min, no fee), 1000 = fast (~2s, fee required)
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (uint64 nonce)",
  "function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData) returns (uint64 nonce)",
  "event MessageSent(bytes message)",
  "event DepositForBurn(uint64 nonce, address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller)"
]);
