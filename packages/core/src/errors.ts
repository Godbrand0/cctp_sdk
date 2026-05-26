import { TransferState } from "./state";

export class CctpError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CctpError";
  }
}

export class UnsupportedChainError extends CctpError {
  constructor(chain: number | string) {
    super(`Chain "${chain}" is not supported by CCTP v2`, "UNSUPPORTED_CHAIN");
  }
}

export class AttestationApiError extends CctpError {
  constructor(status: number, body: string) {
    super(`Circle Attestation API returned ${status}: ${body}`, "ATTESTATION_API_ERROR");
  }
}

export class AttestationTimeoutError extends CctpError {
  constructor(messageHash: string, maxAttempts: number) {
    super(
      `Attestation for ${messageHash} did not complete after ${maxAttempts} attempts`,
      "ATTESTATION_TIMEOUT"
    );
  }
}

export class InvalidStateTransitionError extends CctpError {
  constructor(from: TransferState, to: TransferState) {
    super(`Invalid state transition: ${from} → ${to}`, "INVALID_STATE_TRANSITION");
  }
}

export class MessageParseError extends CctpError {
  constructor(txHash: string) {
    super(`Could not extract MessageSent event from tx ${txHash}`, "MESSAGE_PARSE_ERROR");
  }
}
