import { describe, expect, it } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { encodeAttributedHookData, parseAttributedHookData } from "../src/index.js";

const forwardTo = StrKey.encodeContract(Buffer.alloc(32, 7));
const recipient = Keypair.random().publicKey();

describe("attributed hookData", () => {
  it("matches the byte layout Conduit proved on-chain", () => {
    // Built independently, field by field, from Conduit's useSwap.ts layout.
    const fw = Buffer.from(forwardTo, "ascii");
    const rc = Buffer.from(recipient, "ascii");
    const len = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
    const minOut = Buffer.alloc(16); minOut.writeBigUInt64BE(123456789n, 8);
    const expected = Buffer.concat([Buffer.alloc(28), len(fw.length), fw, len(rc.length), rc, minOut]);

    const got = encodeAttributedHookData({ forwardTo, recipient, minOut: 123456789n });
    expect(Buffer.from(got).equals(expected)).toBe(true);
  });

  it("round-trips", () => {
    const input = { forwardTo, recipient, minOut: 2n ** 100n };
    expect(parseAttributedHookData(encodeAttributedHookData(input))).toEqual(input);
  });

  it("accepts hex input", () => {
    const enc = encodeAttributedHookData({ forwardTo, recipient, minOut: 0n });
    const hex = "0x" + Buffer.from(enc).toString("hex");
    expect(parseAttributedHookData(hex).recipient).toBe(recipient);
  });

  it("rejects non-Stellar addresses", () => {
    expect(() => encodeAttributedHookData({ forwardTo, recipient: "0xabc", minOut: 0n })).toThrow();
    expect(() => encodeAttributedHookData({ forwardTo: "nope", recipient, minOut: 0n })).toThrow();
  });

  it("rejects minOut that does not fit 16 bytes", () => {
    expect(() => encodeAttributedHookData({ forwardTo, recipient, minOut: 2n ** 128n })).toThrow();
  });

  it("rejects truncated and versioned data", () => {
    const enc = encodeAttributedHookData({ forwardTo, recipient, minOut: 1n });
    expect(() => parseAttributedHookData(enc.subarray(0, enc.length - 1))).toThrow(/truncated/);
    const bad = enc.slice(); bad[27] = 1;
    expect(() => parseAttributedHookData(bad)).toThrow(/version/);
  });
});
