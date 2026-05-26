import EventEmitter from "eventemitter3";
import { type WalletClient, type PublicClient, type Hash, keccak256, parseEventLogs } from "viem";
import { TransferState, type TransferStateSnapshot, validateTransition } from "./state";
import { CctpError } from "./errors";
import { AttestationClient } from "./attestation";
import { getChain } from "./chains";
import { TOKEN_MESSENGER_ABI } from "./abis/TokenMessenger";
import { MESSAGE_TRANSMITTER_ABI } from "./abis/MessageTransmitter";
import { USDC_ABI } from "./abis/USDC";
import { encodeHook } from "./hooks";
import { getOrCreatePublicClient } from "./utils/fee";
import type { TransferParams, CctpClientConfig } from "./types";

const generateTransferId = () => Math.random().toString(36).substring(2, 15);
const addressToBytes32 = (address: string) => ("0x" + "0".repeat(24) + address.slice(2)) as `0x${string}`;
const toCctpError = (err: any) => err instanceof CctpError ? err : new CctpError(err.message || "Unknown error", "UNKNOWN_ERROR");

export class Transfer extends EventEmitter<{
  stateChange: [TransferStateSnapshot];
  error: [CctpError];
}> {
  readonly transferId: string;
  private snapshot: TransferStateSnapshot;
  private attestationClient: AttestationClient;

  constructor(
    private params: TransferParams,
    private sourceWallet: WalletClient,
    private destinationWallet: WalletClient | undefined,
    private config: Required<CctpClientConfig>,
    initialSnapshot?: TransferStateSnapshot
  ) {
    super();
    this.transferId = initialSnapshot?.transferId ?? generateTransferId();
    this.snapshot = initialSnapshot ?? {
      state: TransferState.IDLE,
      transferId: this.transferId,
      params: this.params,
      updatedAt: Date.now()
    };
    this.snapshot.params = this.params;
    this.attestationClient = new AttestationClient(config.attestationApiUrl);
    this.persistState();
  }

  async execute(): Promise<void> {
    try {
      if (this.snapshot.state === TransferState.COMPLETE) {
        return;
      }

      if (
        this.snapshot.state === TransferState.IDLE ||
        this.snapshot.state === TransferState.APPROVING ||
        this.snapshot.state === TransferState.APPROVED
      ) {
        if (this.needsApproval()) {
          await this.approve();
        }
        await this.burn();
      }

      if (
        this.snapshot.state === TransferState.BURNING ||
        this.snapshot.state === TransferState.BURNED ||
        this.snapshot.state === TransferState.AWAITING_ATTESTATION
      ) {
        await this.waitForAttestation();
      }

      if (
        this.snapshot.state === TransferState.ATTESTED ||
        this.snapshot.state === TransferState.RELAYING
      ) {
        await this.relay();
      }
    } catch (err) {
      if (this.snapshot.state !== TransferState.COMPLETE && this.snapshot.state !== TransferState.FAILED) {
        try {
          this.transition(TransferState.FAILED, { error: toCctpError(err) });
        } catch {
          // swallow — original error is what matters
        }
      }
      throw err;
    }
  }

  wait(): Promise<TransferStateSnapshot> {
    if (this.snapshot.state === TransferState.COMPLETE) {
      return Promise.resolve(this.snapshot);
    }
    return new Promise((resolve, reject) => {
      this.on("stateChange", (snap) => {
        if (snap.state === TransferState.COMPLETE) resolve(snap);
        if (snap.state === TransferState.FAILED) reject(snap.error);
      });
    });
  }

  get state(): TransferState {
    return this.snapshot.state;
  }

  get currentSnapshot(): TransferStateSnapshot {
    return { ...this.snapshot };
  }

  private async approve(): Promise<void> {
    const sourceChain = getChain(this.params.from, this.config.env);
    const publicClient = this.getPublicClient(sourceChain.chainId);

    const allowance = await publicClient.readContract({
      address: sourceChain.usdc,
      abi: USDC_ABI,
      functionName: "allowance",
      args: [this.sourceWallet.account!.address, sourceChain.tokenMessenger],
    });

    if (allowance >= this.params.amount) {
      this.transition(TransferState.APPROVED);
      return;
    }

    this.transition(TransferState.APPROVING);

    const hash = await this.sourceWallet.writeContract({
      address: sourceChain.usdc,
      abi: USDC_ABI,
      functionName: "approve",
      args: [sourceChain.tokenMessenger, this.params.amount],
      account: this.sourceWallet.account!,
      chain: this.sourceWallet.chain,
    });

    await publicClient.waitForTransactionReceipt({ hash });
    this.transition(TransferState.APPROVED);
  }

  private async burn(): Promise<void> {
    this.transition(TransferState.BURNING);
    const sourceChain = getChain(this.params.from, this.config.env);
    const destChain = getChain(this.params.to, this.config.env);
    const publicClient = this.getPublicClient(sourceChain.chainId);

    const recipient = this.params.recipient ?? this.sourceWallet.account!.address;
    const recipientBytes32 = addressToBytes32(recipient);

    let maxFee = this.params.maxFee ?? 0n;
    if (!this.params.maxFee && (this.params.fast || this.params.hook)) {
      const minimumFee = await this.attestationClient.getMinimumFee(
        sourceChain.domain,
        destChain.domain
      );
      if (minimumFee > this.params.amount) {
        throw new CctpError(
          `Fast transfer fee (${minimumFee} base units) exceeds transfer amount (${this.params.amount} base units). Use a larger amount or set fast: false.`,
          "FEE_EXCEEDS_AMOUNT"
        );
      }
      maxFee = minimumFee;
    }

    // CCTP v2: 7-arg depositForBurn
    // destinationCaller=bytes32(0) → any relayer can relay
    // minFinalityThreshold: 1000 = fast lane, 0 = standard
    const destinationCaller = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    const minFinalityThreshold = this.params.fast ? 1000 : 0;

    let hash: Hash;

    if (this.params.hook) {
      hash = await this.sourceWallet.writeContract({
        address: sourceChain.tokenMessenger,
        abi: TOKEN_MESSENGER_ABI,
        functionName: "depositForBurnWithHook",
        args: [
          this.params.amount,
          destChain.domain,
          recipientBytes32,
          sourceChain.usdc,
          destinationCaller,
          maxFee,
          minFinalityThreshold,
          encodeHook(this.params.hook),
        ],
        account: this.sourceWallet.account!,
        chain: this.sourceWallet.chain,
        gas: BigInt(500000),
      });
    } else {
      hash = await this.sourceWallet.writeContract({
        address: sourceChain.tokenMessenger,
        abi: TOKEN_MESSENGER_ABI,
        functionName: "depositForBurn",
        args: [
          this.params.amount,
          destChain.domain,
          recipientBytes32,
          sourceChain.usdc,
          destinationCaller,
          maxFee,
          minFinalityThreshold,
        ],
        account: this.sourceWallet.account!,
        chain: this.sourceWallet.chain,
        gas: BigInt(500000),
      });
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const messageBytes = this.extractMessageBytes(receipt, sourceChain.messageTransmitter);
    const messageHash = keccak256(messageBytes);

    this.transition(TransferState.BURNED, {
      sourceTxHash: hash,
      messageBytes,
    });

    await this.persistState(messageHash);
  }

  private async waitForAttestation(): Promise<void> {
    this.transition(TransferState.AWAITING_ATTESTATION);
    const sourceChain = getChain(this.params.from, this.config.env);

    const result = await this.attestationClient.poll(
      this.snapshot.sourceTxHash!,
      sourceChain.domain,
      {
        maxAttempts: this.config.maxAttestationAttempts,
        intervalMs: this.config.pollIntervalMs,
        onAttempt: () => {
          this.emit("stateChange", { ...this.snapshot, updatedAt: Date.now() });
        },
      }
    );

    // Use message bytes from Iris if provided — raw event log bytes have a zero nonce in CCTP v2
    const messageBytes = result.messageBytes ?? this.snapshot.messageBytes!;
    this.transition(TransferState.ATTESTED, { attestation: result.attestation, messageBytes });
  }

  private async relay(): Promise<void> {
    this.transition(TransferState.RELAYING);
    const destChain = getChain(this.params.to, this.config.env);
    const wallet = this.destinationWallet ?? this.sourceWallet;
    const publicClient = this.getPublicClient(destChain.chainId);

    const hash = await wallet.writeContract({
      address: destChain.messageTransmitter,
      abi: MESSAGE_TRANSMITTER_ABI,
      functionName: "receiveMessage",
      args: [this.snapshot.messageBytes!, this.snapshot.attestation!],
      account: wallet.account!,
      chain: wallet.chain,
    });

    await publicClient.waitForTransactionReceipt({ hash });
    this.transition(TransferState.COMPLETE, { destinationTxHash: hash });
  }

  private transition(state: TransferState, update: Partial<TransferStateSnapshot> = {}): void {
    validateTransition(this.snapshot.state, state);
    this.snapshot = { ...this.snapshot, ...update, state, updatedAt: Date.now() };
    this.emit("stateChange", this.currentSnapshot);
  }

  private needsApproval(): boolean {
    return this.snapshot.state === TransferState.IDLE;
  }

  private getPublicClient(chainId: number): PublicClient {
    return getOrCreatePublicClient(chainId, this.config.rpcs, this.config.env) as any as PublicClient;
  }

  private extractMessageBytes(receipt: any, _messageTransmitter: string): `0x${string}` {
    const parsedLogs = parseEventLogs({
      abi: MESSAGE_TRANSMITTER_ABI,
      eventName: "MessageSent",
      logs: receipt.logs
    });

    if (parsedLogs.length > 0) {
      return parsedLogs[0].args.message;
    }
    throw new CctpError("Could not extract message from receipt", "MESSAGE_NOT_FOUND");
  }

  private async persistState(messageHash?: string): Promise<void> {
    const snapshot = this.currentSnapshot;
    const dataStr = JSON.stringify(snapshot, (_key, value) => {
      return typeof value === "bigint" ? value.toString() : value;
    });

    const keys = [`cctp-transfer-${this.transferId}`];
    if (messageHash) {
      keys.push(`cctp-transfer-hash-${messageHash}`);
    }
    if (snapshot.sourceTxHash) {
      keys.push(`cctp-transfer-tx-${snapshot.sourceTxHash}`);
    }

    if (typeof window !== "undefined" && window.localStorage) {
      for (const k of keys) {
        window.localStorage.setItem(k, dataStr);
      }
    } else {
      try {
        const fs = await import("fs");
        const path = await import("path");
        for (const k of keys) {
          const filePath = path.join("/tmp", `${k}.json`);
          fs.writeFileSync(filePath, dataStr);
        }
      } catch (err) {
        // ignore
      }
    }
  }

  static async fromId(
    transferId: string,
    sourceWallet: WalletClient,
    destinationWallet: WalletClient | undefined,
    config: Required<CctpClientConfig>
  ): Promise<Transfer> {
    const key = `cctp-transfer-${transferId}`;
    let dataStr: string | null = null;

    if (typeof window !== "undefined" && window.localStorage) {
      dataStr = window.localStorage.getItem(key);
    } else {
      try {
        const fs = await import("fs");
        const path = await import("path");
        const filePath = path.join("/tmp", `${key}.json`);
        if (fs.existsSync(filePath)) {
          dataStr = fs.readFileSync(filePath, "utf8");
        }
      } catch (err) {
        // ignore
      }
    }

    if (!dataStr) {
      throw new CctpError(`Transfer not found for ID: ${transferId}`, "TRANSFER_NOT_FOUND");
    }

    const snapshot = JSON.parse(dataStr) as TransferStateSnapshot;
    if (!snapshot.params) {
      throw new CctpError("Stored snapshot lacks original transfer params", "INVALID_SNAPSHOT");
    }

    return new Transfer(snapshot.params, sourceWallet, destinationWallet, config, snapshot);
  }

  static async getStatusFromHash(
    txHash: `0x${string}`,
    sourceChain: import("./chains").SupportedChain,
    config: Required<CctpClientConfig>
  ): Promise<TransferStateSnapshot> {
    const key = `cctp-transfer-tx-${txHash}`;
    let dataStr: string | null = null;

    if (typeof window !== "undefined" && window.localStorage) {
      dataStr = window.localStorage.getItem(key);
    } else {
      try {
        const fs = await import("fs");
        const path = await import("path");
        const filePath = path.join("/tmp", `${key}.json`);
        if (fs.existsSync(filePath)) {
          dataStr = fs.readFileSync(filePath, "utf8");
        }
      } catch (err) {
        // ignore
      }
    }

    if (dataStr) {
      return JSON.parse(dataStr) as TransferStateSnapshot;
    }

    // Fallback: Recover from the blockchain receipt
    const sourceChainConfig = getChain(sourceChain, config.env);
    const publicClient = getOrCreatePublicClient(sourceChainConfig.chainId, config.rpcs, config.env) as any as PublicClient;
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

    const parsedLogs = parseEventLogs({
      abi: MESSAGE_TRANSMITTER_ABI,
      eventName: "MessageSent",
      logs: receipt.logs
    });

    if (parsedLogs.length === 0) {
      throw new CctpError("No CCTP MessageSent event found in receipt", "MESSAGE_NOT_FOUND");
    }

    const messageBytes = parsedLogs[0].args.message;
    const messageHash = keccak256(messageBytes);

    const attestationClient = new AttestationClient(config.attestationApiUrl);
    const attResponse = await attestationClient.getAttestation(messageHash);

    const state = attResponse.status === "complete" ? TransferState.ATTESTED : TransferState.AWAITING_ATTESTATION;

    return {
      state,
      transferId: "recovered-" + messageHash.slice(2, 10),
      sourceTxHash: txHash,
      messageBytes,
      attestation: attResponse.attestation ?? undefined,
      updatedAt: Date.now(),
    };
  }
}
