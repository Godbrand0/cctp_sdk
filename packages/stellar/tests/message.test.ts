import { describe, expect, it } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { encodeAttributedHookData, parseAttributedHookData, parseCctpV2Message } from "../src/index.js";

const word = (n: number) => Buffer.alloc(32, n);
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const amt = (n: bigint) => { const b = Buffer.alloc(32); b.writeBigUInt64BE(n, 24); return b; };

function buildMessage(hook: Uint8Array) {
  const header = Buffer.concat([u32(1), u32(3), u32(27), word(0xa1), word(0xa2), word(0xa3), word(0xa4), u32(1000), u32(2000)]);
  const body = Buffer.concat([u32(1), word(0xb1), word(0xb2), amt(20_500_000n), word(0xb3), amt(5n), amt(4n), amt(0n)]);
  return Buffer.concat([header, body, hook]);
}

describe("parseCctpV2Message", () => {
  const forwardTo = StrKey.encodeContract(Buffer.alloc(32, 9));
  const recipient = Keypair.random().publicKey();
  const hook = encodeAttributedHookData({ forwardTo, recipient, minOut: 77n });
  const msg = parseCctpV2Message(buildMessage(hook));

  it("reads header and body fields", () => {
    expect(msg.sourceDomain).toBe(3);
    expect(msg.destinationDomain).toBe(27);
    expect(msg.minFinalityThreshold).toBe(1000);
    expect(msg.finalityThresholdExecuted).toBe(2000);
    expect(msg.amount).toBe(20_500_000n);
    expect(msg.maxFee).toBe(5n);
    expect(msg.feeExecuted).toBe(4n);
    expect(msg.nonce).toBe("0x" + "a1".repeat(32));
  });

  it("amount sits at absolute bytes 216-248, matching Conduit's relayer", () => {
    const raw = buildMessage(hook);
    expect(BigInt("0x" + raw.subarray(216, 248).toString("hex"))).toBe(msg.amount);
  });

  it("exposes hookData that parses back", () => {
    expect(parseAttributedHookData(msg.hookData)).toEqual({ forwardTo, recipient, minOut: 77n });
  });

  it("rejects short messages", () => {
    expect(() => parseCctpV2Message(new Uint8Array(100))).toThrow(/too short/);
  });
});
