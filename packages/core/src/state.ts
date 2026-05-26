import type { CctpError } from "./errors";

export enum TransferState {
  IDLE = "IDLE",
  APPROVING = "APPROVING",           // USDC approval tx submitted
  APPROVED = "APPROVED",             // approval confirmed
  BURNING = "BURNING",               // depositForBurn tx submitted
  BURNED = "BURNED",                 // burn confirmed, message emitted
  AWAITING_ATTESTATION = "AWAITING_ATTESTATION", // polling Circle API
  ATTESTED = "ATTESTED",             // Circle signed, ready to relay
  RELAYING = "RELAYING",             // receiveMessage tx submitted
  COMPLETE = "COMPLETE",             // mint confirmed on destination
  FAILED = "FAILED",                 // unrecoverable error
}

export type TransferStateSnapshot = {
  state: TransferState;
  transferId: string;
  params?: any; // avoid circular dependency or complex types in state machine definitions
  sourceTxHash?: `0x${string}`;
  messageBytes?: `0x${string}`;
  attestation?: `0x${string}`;
  destinationTxHash?: `0x${string}`;
  error?: CctpError;
  updatedAt: number;  // unix ms
};

// Valid state transitions — enforced at runtime
export const STATE_TRANSITIONS: Record<TransferState, TransferState[]> = {
  [TransferState.IDLE]: [TransferState.APPROVING, TransferState.APPROVED, TransferState.BURNING],
  [TransferState.APPROVING]: [TransferState.APPROVED, TransferState.FAILED],
  [TransferState.APPROVED]: [TransferState.BURNING],
  [TransferState.BURNING]: [TransferState.BURNED, TransferState.FAILED],
  [TransferState.BURNED]: [TransferState.AWAITING_ATTESTATION],
  [TransferState.AWAITING_ATTESTATION]: [TransferState.ATTESTED, TransferState.FAILED],
  [TransferState.ATTESTED]: [TransferState.RELAYING],
  [TransferState.RELAYING]: [TransferState.COMPLETE, TransferState.FAILED],
  [TransferState.COMPLETE]: [],
  [TransferState.FAILED]: [TransferState.BURNING, TransferState.RELAYING], // resumable
};

export function validateTransition(from: TransferState, to: TransferState) {
  if (!STATE_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid state transition: ${from} -> ${to}`);
  }
}
