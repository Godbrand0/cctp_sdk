import type { WalletClient, Address } from "viem";
import type { SupportedChain } from "./chains";

export type TransferParams = {
  /** Source chain identifier — chainId number or name string */
  sourceChain: SupportedChain | number;
  /** Destination chain identifier */
  destinationChain: SupportedChain | number;
  /** Amount in USDC base units (6 decimals). Use parseUnits("10", 6) for $10 */
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
  /** Signer for source chain (required) */
  sourceWalletClient: WalletClient;
  /** Signer for destination chain relay tx */
  destinationWalletClient?: WalletClient;
};

export type CctpClientConfig = {
  /** Environment — affects attestation API URL and contract addresses */
  env?: "mainnet" | "testnet";
  /** Override Circle's attestation API base URL */
  attestationApiUrl?: string;
  /** Max polling attempts before failing */
  maxAttestationAttempts?: number;
  /** Polling interval in ms (uses exponential backoff if not set) */
  pollIntervalMs?: number;
  /** Custom per-chain RPC overrides */
  rpcs?: Partial<Record<SupportedChain, string>>;
};
