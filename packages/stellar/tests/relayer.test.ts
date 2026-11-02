import { describe, expect, it } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  MemoryStore,
  RelayError,
  STELLAR_TESTNET,
  StellarRelayer,
  encodeAttributedHookData,
  type SorobanInvoker,
} from "../src/index.js";

const net = STELLAR_TESTNET;
const forwarderBytes = Buffer.from(StrKey.decodeContract(net.cctpForwarder));
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const word = (n: number) => Buffer.alloc(32, n);

function message(opts: { destDomain?: number; mintRecipient?: Buffer; nonce?: number } = {}): `0x${string}` {
  const hook = encodeAttributedHookData({
    forwardTo: StrKey.encodeContract(Buffer.alloc(32, 9)),
    recipient: Keypair.random().publicKey(),
    minOut: 0n,
  });
  const amount = Buffer.alloc(32); amount.writeBigUInt64BE(5_000_000n, 24);
  const header = Buffer.concat([u32(1), u32(3), u32(opts.destDomain ?? 27), word(opts.nonce ?? 0xaa), word(1), word(2), word(3), u32(1000), u32(2000)]);
  const body = Buffer.concat([u32(1), word(4), opts.mintRecipient ?? forwarderBytes, amount, word(5), word(0), word(0), word(0)]);
  return ("0x" + Buffer.concat([header, body, hook]).toString("hex")) as `0x${string}`;
}

class FakeInvoker implements SorobanInvoker {
  calls: { contractId: string; method: string }[] = [];
  nonceUsed = false;
  failMethods = new Set<string>();
  /** Flip nonceUsed after a failed mint, simulating a concurrent relayer winning the race. */
  usedAfterFailedMint = false;
  async invoke(contractId: string, method: string) {
    this.calls.push({ contractId, method });
    if (this.failMethods.has(method)) {
      if (this.usedAfterFailedMint) this.nonceUsed = true;
      return { hash: `fail-${method}`, ok: false, detail: "boom" };
    }
    if (method === "mint_and_forward") this.nonceUsed = true;
    return { hash: `tx-${method}`, ok: true };
  }
  async read() { return this.nonceUsed; }
  methods() { return this.calls.map((c) => c.method); }
}

const attestations = (msg: `0x${string}`) => ({
  poll: async () => ({ attestation: "0x" + "ab".repeat(65) as `0x${string}`, messageBytes: msg }),
});
const consumer = { contractId: StrKey.encodeContract(Buffer.alloc(32, 1)), method: "deliver" };
const BURN = ("0x" + "11".repeat(32)) as `0x${string}`;

describe("StellarRelayer", () => {
  it("mints then calls the consumer", async () => {
    const invoker = new FakeInvoker();
    const r = new StellarRelayer({ network: net, invoker, attestations: attestations(message()), consumer });
    const res = await r.relay(BURN, 3);
    expect(invoker.methods()).toEqual(["mint_and_forward", "deliver"]);
    expect(invoker.calls[0]!.contractId).toBe(net.cctpForwarder);
    expect(res).toMatchObject({ status: "complete", mintSkipped: false, amount: 5_000_000n });
  });

  it("skips the mint when the nonce is already used", async () => {
    const invoker = new FakeInvoker(); invoker.nonceUsed = true;
    const r = new StellarRelayer({ network: net, invoker, attestations: attestations(message()), consumer });
    const res = await r.relay(BURN, 3);
    expect(invoker.methods()).toEqual(["deliver"]);
    expect(res.mintSkipped).toBe(true);
  });

  it("treats a failed mint as success if a concurrent relayer consumed the nonce", async () => {
    const invoker = new FakeInvoker(); invoker.failMethods.add("mint_and_forward"); invoker.usedAfterFailedMint = true;
    const r = new StellarRelayer({ network: net, invoker, attestations: attestations(message()), consumer });
    await expect(r.relay(BURN, 3)).resolves.toMatchObject({ status: "complete", mintSkipped: true });
  });

  it("fails and records a mint failure when the nonce is still unused", async () => {
    const invoker = new FakeInvoker(); invoker.failMethods.add("mint_and_forward");
    const store = new MemoryStore();
    const r = new StellarRelayer({ network: net, invoker, attestations: attestations(message()), consumer, store });
    await expect(r.relay(BURN, 3)).rejects.toMatchObject({ step: "mint" });
    expect(invoker.methods()).toEqual(["mint_and_forward"]);
    expect((await store.get(BURN))?.status).toBe("failed");
  });

  it("resumes at the consumer step after a crash, without re-minting", async () => {
    const invoker = new FakeInvoker();
    const store = new MemoryStore();
    await store.set(BURN, { status: "minted", mintTx: "earlier" });
    const r = new StellarRelayer({ network: net, invoker, attestations: attestations(message()), consumer, store });
    const res = await r.relay(BURN, 3);
    expect(invoker.methods()).toEqual(["deliver"]);
    expect(res.mintTx).toBe("earlier");
  });

  it("does not repeat a consumer call that already succeeded", async () => {
    const invoker = new FakeInvoker();
    const store = new MemoryStore();
    await store.set(BURN, { status: "minted", mintTx: "m", consumerTx: "c" });
    const r = new StellarRelayer({ network: net, invoker, attestations: attestations(message()), consumer, store });
    await r.relay(BURN, 3);
    expect(invoker.calls).toEqual([]);
  });

  it("records a consumer failure", async () => {
    const invoker = new FakeInvoker(); invoker.failMethods.add("deliver");
    const r = new StellarRelayer({ network: net, invoker, attestations: attestations(message()), consumer });
    await expect(r.relay(BURN, 3)).rejects.toMatchObject({ step: "consumer" });
  });

  it("rejects a message for another destination domain before any call", async () => {
    const invoker = new FakeInvoker();
    const r = new StellarRelayer({ network: net, invoker, attestations: attestations(message({ destDomain: 6 })), consumer });
    await expect(r.relay(BURN, 3)).rejects.toMatchObject({ step: "validate" });
    expect(invoker.calls).toEqual([]);
  });

  it("rejects a mintRecipient that is not the forwarder before any call", async () => {
    const invoker = new FakeInvoker();
    const r = new StellarRelayer({ network: net, invoker, attestations: attestations(message({ mintRecipient: word(0xee) })), consumer });
    await expect(r.relay(BURN, 3)).rejects.toBeInstanceOf(RelayError);
    expect(invoker.calls).toEqual([]);
  });

  it("surfaces attestation failures", async () => {
    const invoker = new FakeInvoker();
    const r = new StellarRelayer({ network: net, invoker, attestations: { poll: async () => { throw new Error("timeout"); } }, consumer });
    await expect(r.relay(BURN, 3)).rejects.toMatchObject({ step: "attestation" });
  });

  it("works with no consumer (forwarder-only)", async () => {
    const invoker = new FakeInvoker();
    const r = new StellarRelayer({ network: net, invoker, attestations: attestations(message()) });
    const res = await r.relay(BURN, 3);
    expect(invoker.methods()).toEqual(["mint_and_forward"]);
    expect(res.consumerTx).toBeUndefined();
  });
});
