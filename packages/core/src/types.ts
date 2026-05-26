import type { WalletClient, Address } from "viem";
import type { SupportedChain } from "./chains";

export type TransferParams = {
  /** Source chain name */
  from: SupportedChain;
  /** Destination chain name */
  to: SupportedChain;
  /** Amount in USDC base units. Most chains use 6 decimals — use parseUnits("10", 6) for $10.
   *  Arc is the exception: USDC is the native gas token with 18 decimals — use parseUnits("10", 18).
   *  Check ChainConfig.usdcDecimals for the correct precision per chain. */
  amount: bigint;
  /** Recipient address on destination chain. Defaults to sender if omitted. */
  recipient?: Address;
  /** Use fast transfer lane (CCTP v2 only). Defaults to true if supported. */
  fast?: boolean;
  /** Optional hook to execute on destination chain at mint time */
  hook?: TransferHook;
  /** Max fee in USDC base units for fast lane. Required if fast === true. */
  maxFee?: bigint;
};

export type TransferHook = {
  /** Target contract address on destination chain */
  target: Address;
  /** Encoded calldata to execute */
  calldata: `0x${string}`;
  /** USDC amount to forward to hook target (must be <= transfer amount) */
  forwardAmount?: bigint;
};

export type FeeEstimate = {
  /** Estimated gas cost in source chain native token (wei) */
  gasCostWei: bigint;
  /** Bridge fee in USDC base units (for fast lane) */
  bridgeFeeUsdc: bigint;
  /** Total time estimate in seconds */
  estimatedSeconds: number;
  /** Whether fast lane was used in this estimate */
  isFast: boolean;
};

export type ResumeParams = {
  /** The transferId returned from a previous transfer() call */
  transferId: string;
  /** Signer for source chain */
  walletClient: WalletClient;
  /** Signer for destination chain relay tx (can be the same wallet) */
  destinationWalletClient?: WalletClient;
};

export type CctpClientConfig = {
  /** Environment — "mainnet" or "testnet". Defaults to "mainnet". */
  env?: "mainnet" | "testnet";
  /** Allowlist of chains this client can transfer between. If omitted, all chains are permitted. */
  chains?: SupportedChain[];
  /** Override Circle's attestation API base URL */
  attestationApiUrl?: string;
  /** Max polling attempts before failing */
  maxAttestationAttempts?: number;
  /** Polling interval in ms (uses exponential backoff if not set) */
  pollIntervalMs?: number;
  /** Custom per-chain RPC overrides */
  rpcs?: Partial<Record<SupportedChain, string>>;
};
