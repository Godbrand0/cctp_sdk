import type { WalletClient } from "viem";
import { Transfer } from "./transfer";
import { estimateFee } from "./utils/fee";
import type { CctpClientConfig, TransferParams, FeeEstimate } from "./types";
import { type SupportedChain } from "./chains";
import { CctpError } from "./errors";

export class CctpClient {
  private config: Required<CctpClientConfig>;

  constructor(config: CctpClientConfig = {}) {
    const env = config.env ?? "mainnet";
    this.config = {
      env,
      chains: config.chains ?? [],
      attestationApiUrl:
        config.attestationApiUrl ??
        (env === "testnet"
          ? "https://iris-api-sandbox.circle.com"
          : "https://iris-api.circle.com"),
      maxAttestationAttempts: config.maxAttestationAttempts ?? 60,
      pollIntervalMs: config.pollIntervalMs ?? 0,
      rpcs: config.rpcs ?? {},
    };
  }

  async transfer(
    params: TransferParams,
    walletClient: WalletClient,
    destinationWalletClient?: WalletClient
  ): Promise<Transfer> {
    this.validateChains(params.from, params.to);
    const transfer = new Transfer(params, walletClient, destinationWalletClient, this.config);
    transfer.execute().catch(() => {});
    return transfer;
  }

  async resume(
    transferId: string,
    walletClient: WalletClient,
    destinationWalletClient?: WalletClient
  ): Promise<Transfer> {
    const transfer = await Transfer.fromId(transferId, walletClient, destinationWalletClient, this.config);
    transfer.execute().catch(() => {});
    return transfer;
  }

  async estimateFee(
    params: Pick<TransferParams, "from" | "to" | "amount" | "fast">
  ): Promise<FeeEstimate> {
    return estimateFee(params, this.config);
  }

  async getStatus(sourceTxHash: `0x${string}`, sourceChain: SupportedChain) {
    return Transfer.getStatusFromHash(sourceTxHash, sourceChain, this.config);
  }

  private validateChains(from: SupportedChain, to: SupportedChain): void {
    const allowed = this.config.chains;
    if (!allowed || allowed.length === 0) return;
    if (!allowed.includes(from)) {
      throw new CctpError(`Chain "${from}" not in configured chains list`, "UNSUPPORTED_CHAIN");
    }
    if (!allowed.includes(to)) {
      throw new CctpError(`Chain "${to}" not in configured chains list`, "UNSUPPORTED_CHAIN");
    }
  }
}
