# CCTP v2 SDK — Implementation Specification

> **Project Name:** `@arc/cctp-sdk`
> **Purpose:** Production-grade TypeScript SDK abstracting the full Circle CCTP v2 transfer lifecycle — burn, attestation, relay, hooks — into a clean, composable developer interface.
> **Target Chains:** Arc (primary), Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche (all CCTP v2 supported chains)
> **Language:** TypeScript (ESM + CJS dual build)
> **Runtime:** Browser + Node.js (isomorphic)

---

## 1. Problem Statement

Circle's Cross-Chain Transfer Protocol (CCTP) is the canonical way to move native USDC across chains without wrapped tokens or liquidity pools. The protocol burns USDC on the source chain, waits for Circle's attestation service to sign the burn event, then mints USDC on the destination chain.

CCTP v2 introduced:
- **Fast transfers** — a "fast finality" lane that settles in ~2 seconds instead of waiting for source chain finality
- **Hooks** — arbitrary calldata executed atomically on the destination chain at mint time
- **Improved nonce handling** — better replay protection

**The problem:** Every team implementing CCTP today re-implements the same fragile, error-prone sequence from Circle's docs:

```
1. Approve USDC spend
2. Call depositForBurn on TokenMessenger
3. Parse MessageSent event log → extract raw message bytes
4. Poll Circle's Attestation REST API until status === "complete"
5. Submit message + attestation to MessageTransmitter.receiveMessage()
6. Handle destination hook execution
7. Retry on failure, handle reorgs, manage nonce collisions
```

Steps 3–7 are where teams consistently introduce bugs. There is no production-grade open-source abstraction for this. This SDK is that abstraction.

---

## 2. Repository Structure

```
cctp-sdk/
├── packages/
│   ├── core/                      # @arc/cctp-sdk (main package)
│   │   ├── src/
│   │   │   ├── index.ts           # public exports
│   │   │   ├── client.ts          # CctpClient — main entry point
│   │   │   ├── transfer.ts        # Transfer class — lifecycle manager
│   │   │   ├── attestation.ts     # Circle Attestation API wrapper
│   │   │   ├── relay.ts           # Relay logic (manual + auto)
│   │   │   ├── hooks.ts           # Hook builder and encoder
│   │   │   ├── state.ts           # TransferState enum + machine
│   │   │   ├── chains.ts          # Supported chain configs
│   │   │   ├── abis/
│   │   │   │   ├── TokenMessenger.ts
│   │   │   │   ├── MessageTransmitter.ts
│   │   │   │   └── USDC.ts
│   │   │   ├── errors.ts          # Typed error classes
│   │   │   ├── types.ts           # All public TypeScript types
│   │   │   └── utils/
│   │   │       ├── fee.ts         # Fee estimation
│   │   │       ├── poll.ts        # Exponential backoff polling
│   │   │       └── encode.ts      # ABI encoding helpers
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   └── fixtures/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── react/                     # @arc/cctp-sdk-react
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── provider.tsx       # CctpProvider (context)
│   │   │   ├── hooks/
│   │   │   │   ├── useTransfer.ts
│   │   │   │   ├── useTransferStatus.ts
│   │   │   │   └── useEstimateFee.ts
│   │   │   └── components/
│   │   │       └── TransferStatusBadge.tsx
│   │   └── package.json
│   │
│   └── hardhat-plugin/            # @arc/cctp-sdk-hardhat
│       ├── src/
│       │   ├── index.ts
│       │   ├── fixture.ts         # Local CCTP fork helpers
│       │   └── mock-attestor.ts   # Offline attestation mock
│       └── package.json
│
├── examples/
│   ├── basic-transfer/
│   ├── transfer-with-hook/
│   ├── agent-payment/
│   └── nextjs-app/
│
├── docs/
├── turbo.json
├── pnpm-workspace.yaml
└── README.md
```

---

## 3. Chain Configuration

All supported CCTP v2 chains must be defined centrally. Arc is added as the primary target.

```typescript
// src/chains.ts

export type ChainConfig = {
  chainId: number;
  name: string;
  domain: number;               // Circle's CCTP domain ID
  rpcUrl?: string;              // optional default RPC
  tokenMessenger: `0x${string}`;
  messageTransmitter: `0x${string}`;
  usdc: `0x${string}`;
  fastTransferSupported: boolean;
  blockExplorer: string;
};

export const CHAINS: Record<string, ChainConfig> = {
  arc: {
    chainId: 1234,              // replace with actual Arc chain ID
    name: "Arc",
    domain: 9,                  // replace with actual Circle domain for Arc
    tokenMessenger: "0x...",   // Arc TokenMessenger address
    messageTransmitter: "0x...", // Arc MessageTransmitter address
    usdc: "0x...",             // USDC on Arc
    fastTransferSupported: true,
    blockExplorer: "https://explorer.arc.io",
  },
  ethereum: {
    chainId: 1,
    name: "Ethereum",
    domain: 0,
    tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
    messageTransmitter: "0x0a992d191DEeC32aFe36203Ad87D7d289a738F81",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    fastTransferSupported: true,
    blockExplorer: "https://etherscan.io",
  },
  base: {
    chainId: 8453,
    name: "Base",
    domain: 6,
    tokenMessenger: "0x1682Ae6375C4E4A97e4B583BC394c861A46D8962",
    messageTransmitter: "0xAD09780d193884d503182aD4588450C416D6F9D4",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    fastTransferSupported: true,
    blockExplorer: "https://basescan.org",
  },
  arbitrum: {
    chainId: 42161,
    name: "Arbitrum",
    domain: 3,
    tokenMessenger: "0x19330d10D9Cc8751218eaf51E8885D058642E08A",
    messageTransmitter: "0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    fastTransferSupported: true,
    blockExplorer: "https://arbiscan.io",
  },
  optimism: {
    chainId: 10,
    name: "Optimism",
    domain: 2,
    tokenMessenger: "0x2B4069517957735bE00ceE0fadAE88a26365528f",
    messageTransmitter: "0x4D41f22c5a0e5c74090899E5a8Fb597a8842b3e8",
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    fastTransferSupported: true,
    blockExplorer: "https://optimistic.etherscan.io",
  },
};

export function getChain(chainIdOrName: number | string): ChainConfig {
  const match = Object.values(CHAINS).find(
    c => c.chainId === chainIdOrName || c.name.toLowerCase() === String(chainIdOrName).toLowerCase()
  );
  if (!match) throw new UnsupportedChainError(chainIdOrName);
  return match;
}
```

---

## 4. Transfer State Machine

The core insight of the SDK is that every CCTP transfer is a state machine. Modeling it explicitly prevents the ad-hoc polling hacks teams currently build.

```typescript
// src/state.ts

export enum TransferState {
  IDLE = "IDLE",
  APPROVING = "APPROVING",           // USDC approval tx submitted
  APPROVED = "APPROVED",             // approval confirmed
  BURNING = "BURNING",               // depositForBurn tx submitted
  BURNED = "BURNED",                 // burn confirmed, message emitted
  AWAITING_ATTESTATION = "AWAITING_ATTESTATION", // polling Circle API
  ATTESTED = "ATTESTED",             // Circle signed, ready to relay
  RELAYING = "RELAYING",             // receiveMessage tx submitted
  COMPLETE = "COMPLETE",             // mint confirmed on destination
  FAILED = "FAILED",                 // unrecoverable error
}

export type TransferStateSnapshot = {
  state: TransferState;
  transferId: string;
  sourceTxHash?: `0x${string}`;
  messageBytes?: `0x${string}`;
  attestation?: `0x${string}`;
  destinationTxHash?: `0x${string}`;
  error?: CctpError;
  updatedAt: number;  // unix ms
};

// Valid state transitions — enforced at runtime
export const STATE_TRANSITIONS: Record<TransferState, TransferState[]> = {
  [TransferState.IDLE]: [TransferState.APPROVING, TransferState.BURNING],
  [TransferState.APPROVING]: [TransferState.APPROVED, TransferState.FAILED],
  [TransferState.APPROVED]: [TransferState.BURNING],
  [TransferState.BURNING]: [TransferState.BURNED, TransferState.FAILED],
  [TransferState.BURNED]: [TransferState.AWAITING_ATTESTATION],
  [TransferState.AWAITING_ATTESTATION]: [TransferState.ATTESTED, TransferState.FAILED],
  [TransferState.ATTESTED]: [TransferState.RELAYING],
  [TransferState.RELAYING]: [TransferState.COMPLETE, TransferState.FAILED],
  [TransferState.COMPLETE]: [],
  [TransferState.FAILED]: [TransferState.BURNING, TransferState.RELAYING], // resumable
};
```

---

## 5. Core Types

```typescript
// src/types.ts
import type { WalletClient, PublicClient, Hash, Address } from "viem";

export type SupportedChain = keyof typeof CHAINS;

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
  /** Signer for destination chain relay tx */
  destinationWalletClient: WalletClient;
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
```

---

## 6. CctpClient — Main Entry Point

```typescript
// src/client.ts

import { createPublicClient, createWalletClient, http } from "viem";
import { Transfer } from "./transfer";
import { estimateFee } from "./utils/fee";
import type { CctpClientConfig, TransferParams, FeeEstimate } from "./types";

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

  /**
   * Execute a full CCTP transfer from source to destination.
   * Returns a Transfer instance — subscribe to state changes or await completion.
   *
   * @example
   * const transfer = await client.transfer({
   *   sourceChain: "ethereum",
   *   destinationChain: "arc",
   *   amount: parseUnits("100", 6),
   *   fast: true,
   * }, walletClient);
   *
   * transfer.on("stateChange", (snapshot) => console.log(snapshot.state));
   * await transfer.wait();
   */
  async transfer(
    params: TransferParams,
    walletClient: WalletClient,
    destinationWalletClient?: WalletClient
  ): Promise<Transfer> {
    const transfer = new Transfer(params, walletClient, destinationWalletClient, this.config);
    await transfer.execute();
    return transfer;
  }

  /**
   * Resume a previously interrupted transfer by transferId.
   * Picks up from the last confirmed state — skips completed steps.
   */
  async resume(
    transferId: string,
    destinationWalletClient: WalletClient
  ): Promise<Transfer> {
    const transfer = await Transfer.fromId(transferId, destinationWalletClient, this.config);
    await transfer.execute();
    return transfer;
  }

  /**
   * Estimate fees and time for a transfer without executing it.
   */
  async estimateFee(
    params: Pick<TransferParams, "sourceChain" | "destinationChain" | "amount" | "fast">
  ): Promise<FeeEstimate> {
    return estimateFee(params, this.config);
  }

  /**
   * Get the current status of a transfer by its source chain tx hash.
   * Useful for checking transfers initiated outside the SDK.
   */
  async getStatus(sourceTxHash: `0x${string}`, sourceChain: SupportedChain) {
    return Transfer.getStatusFromHash(sourceTxHash, sourceChain, this.config);
  }
}
```

---

## 7. Transfer Class — Lifecycle Manager

```typescript
// src/transfer.ts

import EventEmitter from "eventemitter3";
import type { WalletClient, PublicClient, Hash } from "viem";
import { TransferState, type TransferStateSnapshot } from "./state";
import { AttestationClient } from "./attestation";
import type { TransferParams, CctpClientConfig } from "./types";

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
    private config: Required<CctpClientConfig>
  ) {
    super();
    this.transferId = generateTransferId();
    this.snapshot = { state: TransferState.IDLE, transferId: this.transferId, updatedAt: Date.now() };
    this.attestationClient = new AttestationClient(config.attestationApiUrl);
  }

  /** Execute the full transfer lifecycle */
  async execute(): Promise<void> {
    try {
      if (this.needsApproval()) {
        await this.approve();
      }
      await this.burn();
      await this.waitForAttestation();
      await this.relay();
    } catch (err) {
      this.transition(TransferState.FAILED, { error: toCctpError(err) });
      throw err;
    }
  }

  /** Await final COMPLETE or FAILED state */
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

  // ─── Private Step Implementations ──────────────────────────────────────────

  private async approve(): Promise<void> {
    this.transition(TransferState.APPROVING);
    const sourceChain = getChain(this.params.sourceChain);
    const publicClient = this.getPublicClient(sourceChain.chainId);

    // Check existing allowance — skip tx if already approved
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

    const hash = await this.sourceWallet.writeContract({
      address: sourceChain.usdc,
      abi: USDC_ABI,
      functionName: "approve",
      args: [sourceChain.tokenMessenger, this.params.amount],
    });

    await publicClient.waitForTransactionReceipt({ hash });
    this.transition(TransferState.APPROVED);
  }

  private async burn(): Promise<void> {
    this.transition(TransferState.BURNING);
    const sourceChain = getChain(this.params.sourceChain);
    const destChain = getChain(this.params.destinationChain);
    const publicClient = this.getPublicClient(sourceChain.chainId);

    const recipient = this.params.recipient ?? this.sourceWallet.account!.address;
    const recipientBytes32 = addressToBytes32(recipient);

    let hash: Hash;

    if (this.params.hook) {
      // CCTP v2 — depositForBurnWithHook
      hash = await this.sourceWallet.writeContract({
        address: sourceChain.tokenMessenger,
        abi: TOKEN_MESSENGER_ABI,
        functionName: "depositForBurnWithHook",
        args: [
          this.params.amount,
          destChain.domain,
          recipientBytes32,
          sourceChain.usdc,
          this.params.maxFee ?? 0n,
          encodeHook(this.params.hook),
        ],
      });
    } else if (this.params.fast) {
      // CCTP v2 — fast transfer lane
      hash = await this.sourceWallet.writeContract({
        address: sourceChain.tokenMessenger,
        abi: TOKEN_MESSENGER_ABI,
        functionName: "depositForBurn",
        args: [
          this.params.amount,
          destChain.domain,
          recipientBytes32,
          sourceChain.usdc,
          this.params.maxFee ?? 0n,
        ],
      });
    } else {
      // Standard (v1 compatible)
      hash = await this.sourceWallet.writeContract({
        address: sourceChain.tokenMessenger,
        abi: TOKEN_MESSENGER_ABI,
        functionName: "depositForBurn",
        args: [this.params.amount, destChain.domain, recipientBytes32, sourceChain.usdc],
      });
    }

    // Wait for receipt and extract MessageSent event
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const messageBytes = extractMessageBytes(receipt, sourceChain.messageTransmitter);
    const messageHash = keccak256(messageBytes);

    this.transition(TransferState.BURNED, {
      sourceTxHash: hash,
      messageBytes,
    });

    // Store state for resumability
    await this.persistState(messageHash);
  }

  private async waitForAttestation(): Promise<void> {
    this.transition(TransferState.AWAITING_ATTESTATION);
    const messageHash = keccak256(this.snapshot.messageBytes!);

    const attestation = await this.attestationClient.poll(messageHash, {
      maxAttempts: this.config.maxAttestationAttempts,
      intervalMs: this.config.pollIntervalMs,
      onAttempt: (attempt, status) => {
        this.emit("stateChange", { ...this.snapshot, updatedAt: Date.now() });
      },
    });

    this.transition(TransferState.ATTESTED, { attestation });
  }

  private async relay(): Promise<void> {
    this.transition(TransferState.RELAYING);
    const destChain = getChain(this.params.destinationChain);
    const wallet = this.destinationWallet ?? this.sourceWallet;
    const publicClient = this.getPublicClient(destChain.chainId);

    const hash = await wallet.writeContract({
      address: destChain.messageTransmitter,
      abi: MESSAGE_TRANSMITTER_ABI,
      functionName: "receiveMessage",
      args: [this.snapshot.messageBytes!, this.snapshot.attestation!],
      chain: { id: destChain.chainId } as any,
    });

    await publicClient.waitForTransactionReceipt({ hash });
    this.transition(TransferState.COMPLETE, { destinationTxHash: hash });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private transition(state: TransferState, update: Partial<TransferStateSnapshot> = {}): void {
    validateTransition(this.snapshot.state, state);
    this.snapshot = { ...this.snapshot, ...update, state, updatedAt: Date.now() };
    this.emit("stateChange", this.currentSnapshot);
  }

  private needsApproval(): boolean {
    // No approval needed if transfer starts from BURNED state (resume)
    return this.snapshot.state === TransferState.IDLE;
  }

  private getPublicClient(chainId: number): PublicClient {
    // Returns cached viem public client for chainId
    // Uses config.rpcs override if present, falls back to chain default
    return getOrCreatePublicClient(chainId, this.config.rpcs);
  }

  /** Persist state to localStorage (browser) or temp file (Node) for resumability */
  private async persistState(key: string): Promise<void> {
    // Implementation: serialize snapshot to JSON, store by messageHash
    // Browser: localStorage.setItem(`cctp:${key}`, JSON.stringify(this.snapshot))
    // Node: write to /tmp/cctp-{key}.json
  }

  static async fromId(
    transferId: string,
    destinationWallet: WalletClient,
    config: Required<CctpClientConfig>
  ): Promise<Transfer> {
    // Load persisted state, reconstruct Transfer at correct state
    throw new Error("Not implemented");
  }

  static async getStatusFromHash(
    txHash: `0x${string}`,
    sourceChain: SupportedChain,
    config: Required<CctpClientConfig>
  ) {
    // Parse burn tx, extract messageHash, query attestation API
    throw new Error("Not implemented");
  }
}
```

---

## 8. Attestation Client

```typescript
// src/attestation.ts

export type AttestationStatus = "pending_confirmations" | "complete";

export type AttestationResponse = {
  status: AttestationStatus;
  attestation: `0x${string}` | null;
};

export class AttestationClient {
  constructor(private baseUrl: string) {}

  async getAttestation(messageHash: `0x${string}`): Promise<AttestationResponse> {
    const url = `${this.baseUrl}/v1/attestations/${messageHash}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new AttestationApiError(res.status, await res.text());
    }

    return res.json() as Promise<AttestationResponse>;
  }

  /**
   * Poll until attestation is complete with exponential backoff.
   * Default: starts at 2s, doubles each attempt, caps at 30s.
   */
  async poll(
    messageHash: `0x${string}`,
    opts: {
      maxAttempts: number;
      intervalMs: number;       // 0 = use exponential backoff
      onAttempt?: (attempt: number, status: AttestationStatus) => void;
    }
  ): Promise<`0x${string}`> {
    let attempt = 0;

    while (attempt < opts.maxAttempts) {
      const { status, attestation } = await this.getAttestation(messageHash);
      opts.onAttempt?.(attempt, status);

      if (status === "complete" && attestation) {
        return attestation;
      }

      const delay = opts.intervalMs > 0
        ? opts.intervalMs
        : Math.min(2000 * Math.pow(1.5, attempt), 30_000);

      await sleep(delay);
      attempt++;
    }

    throw new AttestationTimeoutError(messageHash, opts.maxAttempts);
  }
}
```

---

## 9. Hook Builder

The hook system is CCTP v2's most powerful feature. This module makes it ergonomic.

```typescript
// src/hooks.ts

import { encodeAbiParameters, parseAbiParameters } from "viem";
import type { TransferHook } from "./types";

/**
 * Build a hook that deposits minted USDC into a vault on the destination chain.
 *
 * @example
 * const hook = Hooks.depositToVault({
 *   vaultAddress: "0x...",
 *   minSharesOut: parseUnits("99", 18),
 * });
 */
export const Hooks = {
  /**
   * Forward minted USDC directly to a contract function call.
   * Encodes arbitrary calldata.
   */
  raw(target: `0x${string}`, calldata: `0x${string}`, forwardAmount?: bigint): TransferHook {
    return { target, calldata, forwardAmount };
  },

  /**
   * Deposit minted USDC into an ERC4626-compatible vault.
   */
  depositToVault(opts: {
    vaultAddress: `0x${string}`;
    receiver?: `0x${string}`;
    minSharesOut?: bigint;
  }): TransferHook {
    const calldata = encodeFunctionData({
      abi: parseAbi(["function deposit(uint256 assets, address receiver) returns (uint256)"]),
      functionName: "deposit",
      args: [0n /* amount injected at runtime by hook */, opts.receiver ?? "0x0"],
    });
    return { target: opts.vaultAddress, calldata };
  },

  /**
   * Swap minted USDC on a Uniswap v3 pool immediately on destination.
   */
  swapOnUniswap(opts: {
    router: `0x${string}`;
    tokenOut: `0x${string}`;
    fee: number;
    amountOutMinimum: bigint;
    recipient: `0x${string}`;
    deadline?: number;
  }): TransferHook {
    const deadline = opts.deadline ?? Math.floor(Date.now() / 1000) + 1800;
    const calldata = encodeFunctionData({
      abi: parseAbi([
        "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) returns (uint256)"
      ]),
      functionName: "exactInputSingle",
      args: [{
        tokenIn: "0x0",         // USDC on destination — injected at runtime
        tokenOut: opts.tokenOut,
        fee: opts.fee,
        recipient: opts.recipient,
        deadline: BigInt(deadline),
        amountIn: 0n,           // injected at runtime
        amountOutMinimum: opts.amountOutMinimum,
        sqrtPriceLimitX96: 0n,
      }],
    });
    return { target: opts.router, calldata };
  },

  /**
   * Pay a contract for a service (agent-to-agent payment pattern).
   */
  payContract(opts: {
    target: `0x${string}`;
    functionSignature: string;
    args?: readonly unknown[];
  }): TransferHook {
    const calldata = encodeFunctionData({
      abi: parseAbi([opts.functionSignature]),
      functionName: opts.functionSignature.split("(")[0].replace("function ", ""),
      args: opts.args ?? [],
    });
    return { target: opts.target, calldata };
  },
};

export function encodeHook(hook: TransferHook): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters("address target, bytes calldata, uint256 forwardAmount"),
    [hook.target, hook.calldata, hook.forwardAmount ?? 0n]
  );
}
```

---

## 10. Fee Estimation

```typescript
// src/utils/fee.ts

export async function estimateFee(
  params: Pick<TransferParams, "sourceChain" | "destinationChain" | "amount" | "fast">,
  config: Required<CctpClientConfig>
): Promise<FeeEstimate> {
  const sourceChain = getChain(params.sourceChain);
  const destChain = getChain(params.destinationChain);
  const publicClient = getOrCreatePublicClient(sourceChain.chainId, config.rpcs);

  // Estimate gas for burn tx
  const gasEstimate = await publicClient.estimateContractGas({
    address: sourceChain.tokenMessenger,
    abi: TOKEN_MESSENGER_ABI,
    functionName: params.fast ? "depositForBurn" : "depositForBurn",
    args: [params.amount, destChain.domain, "0x" + "0".repeat(64), sourceChain.usdc],
  });

  const gasPrice = await publicClient.getGasPrice();
  const gasCostWei = gasEstimate * gasPrice;

  // Fast lane fee: Circle charges a % of transfer for fast attestation
  // This is a rough estimate — exact fee comes from Circle's fee API if exposed
  const bridgeFeeUsdc = params.fast
    ? (params.amount * 5n) / 10000n   // ~0.05% estimate
    : 0n;

  return {
    gasCostWei,
    bridgeFeeUsdc,
    estimatedSeconds: params.fast ? 2 : 20,
    isFast: !!params.fast,
  };
}
```

---

## 11. Error Types

```typescript
// src/errors.ts

export class CctpError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CctpError";
  }
}

export class UnsupportedChainError extends CctpError {
  constructor(chain: number | string) {
    super(`Chain "${chain}" is not supported by CCTP v2`, "UNSUPPORTED_CHAIN");
  }
}

export class AttestationApiError extends CctpError {
  constructor(status: number, body: string) {
    super(`Circle Attestation API returned ${status}: ${body}`, "ATTESTATION_API_ERROR");
  }
}

export class AttestationTimeoutError extends CctpError {
  constructor(messageHash: string, maxAttempts: number) {
    super(
      `Attestation for ${messageHash} did not complete after ${maxAttempts} attempts`,
      "ATTESTATION_TIMEOUT"
    );
  }
}

export class InvalidStateTransitionError extends CctpError {
  constructor(from: TransferState, to: TransferState) {
    super(`Invalid state transition: ${from} → ${to}`, "INVALID_STATE_TRANSITION");
  }
}

export class MessageParseError extends CctpError {
  constructor(txHash: string) {
    super(`Could not extract MessageSent event from tx ${txHash}`, "MESSAGE_PARSE_ERROR");
  }
}
```

---

## 12. React Hooks Package

```typescript
// packages/react/src/hooks/useTransfer.ts

import { useState, useCallback } from "react";
import { CctpClient, type TransferParams, TransferState } from "@arc/cctp-sdk";
import type { WalletClient } from "viem";

const client = new CctpClient();

export type UseTransferReturn = {
  transfer: (params: TransferParams, wallet: WalletClient, destWallet?: WalletClient) => Promise<void>;
  state: TransferState;
  sourceTxHash: `0x${string}` | undefined;
  destinationTxHash: `0x${string}` | undefined;
  error: Error | undefined;
  isLoading: boolean;
  reset: () => void;
};

export function useTransfer(): UseTransferReturn {
  const [state, setState] = useState<TransferState>(TransferState.IDLE);
  const [sourceTxHash, setSourceTxHash] = useState<`0x${string}` | undefined>();
  const [destinationTxHash, setDestinationTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<Error | undefined>();

  const transfer = useCallback(async (
    params: TransferParams,
    wallet: WalletClient,
    destWallet?: WalletClient
  ) => {
    setError(undefined);
    try {
      const t = await client.transfer(params, wallet, destWallet);

      t.on("stateChange", (snapshot) => {
        setState(snapshot.state);
        if (snapshot.sourceTxHash) setSourceTxHash(snapshot.sourceTxHash);
        if (snapshot.destinationTxHash) setDestinationTxHash(snapshot.destinationTxHash);
      });

      await t.wait();
    } catch (err) {
      setError(err as Error);
    }
  }, []);

  const reset = useCallback(() => {
    setState(TransferState.IDLE);
    setSourceTxHash(undefined);
    setDestinationTxHash(undefined);
    setError(undefined);
  }, []);

  return {
    transfer,
    state,
    sourceTxHash,
    destinationTxHash,
    error,
    isLoading: ![TransferState.IDLE, TransferState.COMPLETE, TransferState.FAILED].includes(state),
    reset,
  };
}
```

```typescript
// packages/react/src/hooks/useEstimateFee.ts

import { useState, useEffect } from "react";
import { CctpClient, type FeeEstimate, type TransferParams } from "@arc/cctp-sdk";

const client = new CctpClient();

export function useEstimateFee(
  params: Pick<TransferParams, "sourceChain" | "destinationChain" | "amount" | "fast"> | null
) {
  const [estimate, setEstimate] = useState<FeeEstimate | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!params || !params.amount) return;
    setLoading(true);
    client.estimateFee(params).then(setEstimate).finally(() => setLoading(false));
  }, [params?.sourceChain, params?.destinationChain, params?.amount?.toString(), params?.fast]);

  return { estimate, loading };
}
```

---

## 13. Hardhat Plugin (Local Testing)

```typescript
// packages/hardhat-plugin/src/mock-attestor.ts

/**
 * MockAttestor replaces Circle's Attestation API in local tests.
 * Spins up an Express server that auto-signs any message hash immediately.
 * Set CCTP_ATTESTATION_URL=http://localhost:3001 in your test env.
 */
import express from "express";
import { keccak256, signMessage } from "viem/utils";

export async function startMockAttestor(port = 3001): Promise<() => void> {
  const app = express();
  const signedMessages = new Map<string, string>();

  // Simulate a signed attestation for any messageHash
  app.get("/v1/attestations/:messageHash", (req, res) => {
    const { messageHash } = req.params;
    if (!signedMessages.has(messageHash)) {
      // Auto-generate a mock attestation signature
      const mockAttestation = "0x" + "ab".repeat(65); // 65-byte fake sig
      signedMessages.set(messageHash, mockAttestation);
    }
    res.json({ status: "complete", attestation: signedMessages.get(messageHash) });
  });

  const server = app.listen(port);
  return () => server.close();
}
```

---

## 14. ABIs (Trimmed — Only What's Needed)

```typescript
// src/abis/TokenMessenger.ts
import { parseAbi } from "viem";

export const TOKEN_MESSENGER_ABI = parseAbi([
  // Standard burn (v1 + v2)
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64 nonce)",
  // Fast burn with maxFee (v2 fast lane)
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, uint256 maxFee) returns (uint64 nonce)",
  // Hook burn (v2)
  "function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, uint256 maxFee, bytes hookData) returns (uint64 nonce)",
  // Events
  "event MessageSent(bytes message)",
  "event DepositForBurn(uint64 nonce, address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller)",
]);

// src/abis/MessageTransmitter.ts
export const MESSAGE_TRANSMITTER_ABI = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) returns (bool success)",
  "event MessageReceived(address indexed caller, uint32 sourceDomain, uint64 indexed nonce, bytes32 sender, bytes messageBody)",
]);

// src/abis/USDC.ts
export const USDC_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);
```

---

## 15. Testing Strategy

### Unit Tests (Vitest)
- State machine transition validation — assert all invalid transitions throw
- Hook encoding — verify ABI-encoded output matches expected bytes
- Fee estimation — mock public client, assert calculation correctness
- Attestation polling — mock fetch, test backoff timing and timeout behavior

### Integration Tests (Live Testnet)
- Full transfer: Ethereum Sepolia → Base Sepolia (CCTP testnet)
- Resume flow: interrupt after burn, resume from transferId
- Hook execution: bridge + deposit into mock vault atomically
- Fast vs standard lane comparison

### Local Hardhat Tests
- Deploy mock TokenMessenger and MessageTransmitter
- Use MockAttestor to bypass Circle's API
- Test full transfer flow in <1 second

### Test File Structure
```
tests/
├── unit/
│   ├── state-machine.test.ts
│   ├── attestation.test.ts
│   ├── hook-builder.test.ts
│   └── fee-estimate.test.ts
├── integration/
│   ├── full-transfer.test.ts
│   ├── resume.test.ts
│   └── hooks.test.ts
└── fixtures/
    ├── mock-wallet.ts
    └── mock-attestor.ts
```

---

## 16. Implementation Milestones

| Milestone | Deliverable | Est. Time |
|---|---|---|
| M1 | Core package: state machine, burn, attestation, relay | 2 weeks |
| M2 | Hook builder + CCTP v2 fast lane support | 1 week |
| M3 | Resume functionality + persistent state | 1 week |
| M4 | Fee estimation + chain config | 3 days |
| M5 | React hooks package | 1 week |
| M6 | Hardhat plugin + mock attestor | 1 week |
| M7 | Integration tests (testnet) | 1 week |
| M8 | Docs, examples, npm publish | 1 week |

---

## 17. package.json (Core)

```json
{
  "name": "@arc/cctp-sdk",
  "version": "0.1.0",
  "description": "Production-grade CCTP v2 transfer lifecycle SDK",
  "main": "dist/index.cjs",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "test": "vitest run",
    "test:integration": "vitest run tests/integration",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "viem": ">=2.0.0"
  },
  "dependencies": {
    "eventemitter3": "^5.0.1"
  },
  "devDependencies": {
    "viem": "^2.0.0",
    "vitest": "^1.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0"
  }
}
```

---

## 18. Key Implementation Notes for Claude Code

1. **ABI trimming**: Follow the `citizen-sdk` pattern — use `parseAbi([...])` with only the exact function signatures needed. Never import full ABI JSON files.

2. **Viem over ethers**: All contract interactions use viem's `writeContract`, `readContract`, `waitForTransactionReceipt`. No ethers.js.

3. **MessageSent log parsing**: The `MessageSent(bytes message)` event is on the `MessageTransmitter` contract address, not `TokenMessenger`. Filter logs by `MessageTransmitter` address in the receipt.

4. **bytes32 recipient encoding**: CCTP requires recipient as `bytes32`, not `address`. Pad address with 12 zero bytes on the left: `"0x" + "0".repeat(24) + address.slice(2)`.

5. **Fast lane maxFee**: When using fast transfers, `maxFee` must be set. If caller omits it, default to a safe estimate (e.g., 0.1% of amount). Zero will revert.

6. **Arc domain ID**: Must be confirmed from Circle's official CCTP v2 documentation for Arc. Do not hardcode a guess.

7. **No singleton clients**: `CctpClient` should not be a singleton at the module level — let consumers instantiate it so they control config and env.

8. **EventEmitter typing**: Use `eventemitter3` for isomorphic EventEmitter with TypeScript generics on event types.
