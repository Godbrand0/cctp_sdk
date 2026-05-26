import { parseAbi } from "viem";

export const TOKEN_MESSENGER_ABI = parseAbi([
  // Standard burn (v1 + v2)
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64 nonce)",
  // Fast burn with maxFee (v2 fast lane)
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, uint256 maxFee) returns (uint64 nonce)",
  // Hook burn (v2)
  "function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, uint256 maxFee, bytes hookData) returns (uint64 nonce)",
  // Events
  "event MessageSent(bytes message)",
  "event DepositForBurn(uint64 nonce, address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller)"
]);
