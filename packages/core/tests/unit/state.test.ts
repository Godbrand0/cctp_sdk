import { describe, it, expect } from "vitest";
import { TransferState, validateTransition } from "../../src/state";

describe("state machine validation", () => {
  it("should allow valid transitions", () => {
    expect(() => validateTransition(TransferState.IDLE, TransferState.APPROVING)).not.toThrow();
    expect(() => validateTransition(TransferState.IDLE, TransferState.BURNING)).not.toThrow();
    expect(() => validateTransition(TransferState.APPROVING, TransferState.APPROVED)).not.toThrow();
    expect(() => validateTransition(TransferState.BURNING, TransferState.BURNED)).not.toThrow();
    expect(() => validateTransition(TransferState.BURNED, TransferState.AWAITING_ATTESTATION)).not.toThrow();
    expect(() => validateTransition(TransferState.AWAITING_ATTESTATION, TransferState.ATTESTED)).not.toThrow();
    expect(() => validateTransition(TransferState.ATTESTED, TransferState.RELAYING)).not.toThrow();
    expect(() => validateTransition(TransferState.RELAYING, TransferState.COMPLETE)).not.toThrow();
  });

  it("should fail on invalid transitions", () => {
    expect(() => validateTransition(TransferState.IDLE, TransferState.COMPLETE)).toThrow(
      "Invalid state transition: IDLE -> COMPLETE"
    );
    expect(() => validateTransition(TransferState.COMPLETE, TransferState.IDLE)).toThrow();
    expect(() => validateTransition(TransferState.BURNED, TransferState.COMPLETE)).toThrow();
  });

  it("should allow resumability transitions from FAILED", () => {
    expect(() => validateTransition(TransferState.FAILED, TransferState.BURNING)).not.toThrow();
    expect(() => validateTransition(TransferState.FAILED, TransferState.RELAYING)).not.toThrow();
  });
});
