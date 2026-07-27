import { parseAbi } from "viem";

/**
 * Destination-chain hook executor (e.g. Conduit's ReceiveAndSwap).
 * Set as mintRecipient + destinationCaller on the burn; `relayAndExecute`
 * calls MessageTransmitter.receiveMessage so USDC mints to the executor,
 * then decodes the hookData from the attested message and executes it.
 */
export const HOOK_EXECUTOR_ABI = parseAbi([
  "function relayAndExecute(bytes message, bytes attestation)",
  "event HookExecuted(address indexed target, uint256 usdcAmount)",
  "event HookFailed(address indexed refundTo, uint256 usdcRefunded)",
  "event NoHookRefund(address indexed refundTo, uint256 usdcRefunded)",
]);
