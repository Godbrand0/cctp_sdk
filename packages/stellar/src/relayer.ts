import { StrKey, nativeToScVal, type xdr } from "@stellar/stellar-sdk";
import { bytesToHex, hexToBytes } from "./bytes.js";
import type { AttestationSource } from "./iris.js";
import { parseCctpV2Message, type CctpV2Message } from "./message.js";
import type { StellarCctpNetwork } from "./networks.js";
import type { SorobanInvoker } from "./soroban.js";

export type RelayStatus = "pending" | "minted" | "complete" | "failed";

export interface RelayRecord {
  status: RelayStatus;
  mintTx?: string;
  consumerTx?: string;
  error?: string;
}

/** Persists progress so a crashed relayer resumes instead of repeating a step. */
export interface RelayStore {
  get(burnTxHash: string): Promise<RelayRecord | undefined>;
  set(burnTxHash: string, record: RelayRecord): Promise<void>;
}

export class MemoryStore implements RelayStore {
  private data = new Map<string, RelayRecord>();
  async get(k: string) {
    return this.data.get(k);
  }
  async set(k: string, r: RelayRecord) {
    this.data.set(k, { ...r });
  }
}

/** A contract called after the mint with the attested message, e.g. an `attested-receiver` consumer. */
export interface ConsumerCall {
  contractId: string;
  method: string;
  /** Extra args after (message, attestation). Default: none. */
  extraArgs?: (message: CctpV2Message) => xdr.ScVal[];
}

export interface RelayerConfig {
  network: StellarCctpNetwork;
  invoker: SorobanInvoker;
  attestations: AttestationSource;
  store?: RelayStore;
  consumer?: ConsumerCall;
  pollMaxAttempts?: number;
  pollIntervalMs?: number;
}

export interface RelayResult {
  status: "complete";
  mintTx?: string;
  consumerTx?: string;
  /** True if the mint had already happened (nonce used) and was skipped. */
  mintSkipped: boolean;
  amount: bigint;
}

export class RelayError extends Error {
  constructor(message: string, readonly step: "validate" | "attestation" | "mint" | "consumer") {
    super(message);
  }
}

/**
 * Relays a CCTP burn into Stellar: polls the attestation, calls the Circle
 * CctpForwarder's `mint_and_forward`, then optionally calls a consumer
 * contract with the same attested message. Both calls are permissionless, so
 * the relayer can pay fees but cannot redirect funds, provided the consumer
 * verifies the attestation itself (see the `attested-receiver` crate).
 */
export class StellarRelayer {
  private store: RelayStore;
  constructor(private cfg: RelayerConfig) {
    this.store = cfg.store ?? new MemoryStore();
  }

  async relay(burnTxHash: `0x${string}`, sourceDomain: number): Promise<RelayResult> {
    const prior = await this.store.get(burnTxHash);
    const record: RelayRecord = prior && prior.status !== "failed" ? { ...prior } : { status: "pending" };

    const { attestation, messageBytes } = await this.cfg.attestations
      .poll(burnTxHash, sourceDomain, {
        maxAttempts: this.cfg.pollMaxAttempts ?? 90,
        intervalMs: this.cfg.pollIntervalMs ?? 2000,
      })
      .catch((e: Error) => this.fail(burnTxHash, record, "attestation", e.message));

    const message = parseCctpV2Message(messageBytes);
    await this.validate(message, burnTxHash, record);

    const messageArg = nativeToScVal(hexToBytes(messageBytes), { type: "bytes" });
    const attestationArg = nativeToScVal(hexToBytes(attestation), { type: "bytes" });

    // Mint step. Skipped if a previous run already minted, or if Circle's
    // MessageTransmitter says the nonce is already consumed (someone else
    // relayed it). The nonce read is authoritative; error-string matching is not.
    let mintSkipped = true;
    if (record.status === "pending") {
      if (await this.nonceUsed(message.nonce)) {
        record.status = "minted";
      } else {
        mintSkipped = false;
        const res = await this.cfg.invoker.invoke(this.cfg.network.cctpForwarder, "mint_and_forward", [
          messageArg,
          attestationArg,
        ]);
        record.mintTx = res.hash;
        if (!res.ok) {
          // A concurrent relayer may have won the race; trust the nonce, not the error text.
          if (await this.nonceUsed(message.nonce)) mintSkipped = true;
          else return this.fail(burnTxHash, record, "mint", res.detail ?? "mint_and_forward failed");
        }
        record.status = "minted";
      }
      await this.store.set(burnTxHash, record);
    }

    const consumer = this.cfg.consumer;
    if (consumer && !record.consumerTx) {
      const extra = consumer.extraArgs?.(message) ?? [];
      const res = await this.cfg.invoker.invoke(consumer.contractId, consumer.method, [
        messageArg,
        attestationArg,
        ...extra,
      ]);
      record.consumerTx = res.hash;
      if (!res.ok) return this.fail(burnTxHash, record, "consumer", res.detail ?? `${consumer.method} failed`);
      await this.store.set(burnTxHash, record);
    }

    record.status = "complete";
    await this.store.set(burnTxHash, record);
    return {
      status: "complete",
      mintTx: record.mintTx,
      consumerTx: record.consumerTx,
      mintSkipped,
      amount: message.amount,
    };
  }

  /** Reject before spending any fee on a message this relayer can't legitimately deliver. */
  private async validate(message: CctpV2Message, burnTxHash: string, record: RelayRecord): Promise<void> {
    const bail = (m: string) => this.fail(burnTxHash, record, "validate", m);
    if (message.destinationDomain !== this.cfg.network.domain) {
      await bail(`message is for domain ${message.destinationDomain}, not Stellar (${this.cfg.network.domain})`);
    }
    // Circle requires mintRecipient and destinationCaller to be the forwarder itself.
    const forwarder = bytesToHex(StrKey.decodeContract(this.cfg.network.cctpForwarder));
    if (message.mintRecipient.toLowerCase() !== forwarder.toLowerCase()) {
      await bail("mintRecipient is not the configured CctpForwarder");
    }
  }

  private async nonceUsed(nonce: `0x${string}`): Promise<boolean> {
    const mt = this.cfg.network.messageTransmitter;
    if (!mt) return false;
    const used = await this.cfg.invoker.read(mt, "is_nonce_used", [
      nativeToScVal(hexToBytes(nonce), { type: "bytes" }),
    ]);
    return used === true;
  }

  private async fail(burnTxHash: string, record: RelayRecord, step: RelayError["step"], message: string): Promise<never> {
    await this.store.set(burnTxHash, { ...record, status: "failed", error: message.slice(0, 500) });
    throw new RelayError(message, step);
  }
}
