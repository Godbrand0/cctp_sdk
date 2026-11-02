import { bytesToHex, hexToBytes, readUintBE } from "./bytes.js";

/** CCTP V2 message header length; the burn body follows. */
const HEADER_LEN = 148;
const BURN_BODY_FIXED = 228;

export interface CctpV2Message {
  sourceDomain: number;
  destinationDomain: number;
  nonce: `0x${string}`;
  sender: `0x${string}`;
  recipient: `0x${string}`;
  destinationCaller: `0x${string}`;
  minFinalityThreshold: number;
  finalityThresholdExecuted: number;
  burnToken: `0x${string}`;
  mintRecipient: `0x${string}`;
  /** USDC amount in the message's units (6 decimals for USDC). */
  amount: bigint;
  messageSender: `0x${string}`;
  maxFee: bigint;
  feeExecuted: bigint;
  expirationBlock: bigint;
  hookData: Uint8Array;
}

/** Parse a CCTP V2 message carrying a BurnMessageV2 body. */
export function parseCctpV2Message(message: Uint8Array | string): CctpV2Message {
  const m = typeof message === "string" ? hexToBytes(message) : message;
  if (m.length < HEADER_LEN + BURN_BODY_FIXED) throw new Error("CCTP message too short");
  const u32 = (o: number) => Number(readUintBE(m.subarray(o, o + 4)));
  const w = (o: number) => bytesToHex(m.subarray(o, o + 32));
  const n = (o: number) => readUintBE(m.subarray(o, o + 32));
  const b = HEADER_LEN;
  return {
    sourceDomain: u32(4),
    destinationDomain: u32(8),
    nonce: w(12),
    sender: w(44),
    recipient: w(76),
    destinationCaller: w(108),
    minFinalityThreshold: u32(140),
    finalityThresholdExecuted: u32(144),
    burnToken: w(b + 4),
    mintRecipient: w(b + 36),
    amount: n(b + 68),
    messageSender: w(b + 100),
    maxFee: n(b + 132),
    feeExecuted: n(b + 164),
    expirationBlock: n(b + 196),
    hookData: m.subarray(b + BURN_BODY_FIXED),
  };
}
