import type { WalletClient } from "viem";
import { Transfer } from "./transfer";
import { estimateFee } from "./utils/fee";
import type { CctpClientConfig, TransferParams, FeeEstimate } from "./types";
import { type SupportedChain } from "./chains";

export class CctpClient {
  private config: Required<CctpClientConfig>;

  constructor(config: CctpClientConfig = {}) {
    this.config = {
      env: config.env ?? "mainnet",
      attestationApiUrl:
        config.attestationApiUrl ??
        (config.env === "testnet"
          ? "https://iris-api-sandbox.circle.com"
          : "https://iris-api.circle.com"),
      maxAttestationAttempts: config.maxAttestationAttempts ?? 60,
      pollIntervalMs: config.pollIntervalMs ?? 0, // 0 = exponential backoff
      rpcs: config.rpcs ?? {},
    };
  }

  async transfer(
    params: TransferParams,
    walletClient: WalletClient,
    destinationWalletClient?: WalletClient
  ): Promise<Transfer> {
    const transfer = new Transfer(params, walletClient, destinationWalletClient, this.config);
    await transfer.execute();
    return transfer;
  }

  async resume(
    transferId: string,
    sourceWalletClient: WalletClient,
    destinationWalletClient?: WalletClient
  ): Promise<Transfer> {
    const transfer = await Transfer.fromId(transferId, sourceWalletClient, destinationWalletClient, this.config);
    await transfer.execute();
    return transfer;
  }

  async estimateFee(
    params: Pick<TransferParams, "sourceChain" | "destinationChain" | "amount" | "fast">
  ): Promise<FeeEstimate> {
    return estimateFee(params, this.config);
  }

  async getStatus(sourceTxHash: `0x${string}`, sourceChain: SupportedChain) {
    return Transfer.getStatusFromHash(sourceTxHash, sourceChain, this.config);
  }
}
