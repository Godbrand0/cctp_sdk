# Arc CCTP v2 SDK

A production-grade, state-machine-driven TypeScript SDK for executing Cross-Chain Transfer Protocol (CCTP) v2 transfers. 

Built with **Viem (v2+)** for robust blockchain interactions, this SDK abstracts away the complexities of CCTP flows, bridging, and attestation polling into a simple, resumable state machine.

## Project Architecture

This project is a monorepo managed with [pnpm workspaces](https://pnpm.io/workspaces) and [Turborepo](https://turbo.build/). It is split into three main packages to ensure modularity and separation of concerns:

- **`@arc/cctp-sdk`** (Core): The fundamental state machine (`Transfer`), API client (`CctpClient`), hook encoder (`Hooks`), and fee estimator.
- **`@arc/cctp-sdk-react`** (React): UI bindings and hooks (`useTransfer`, `useEstimateFee`) to seamlessly integrate CCTP transfers into modern React applications.
- **`@arc/cctp-sdk-hardhat`** (Testing): A testing plugin containing a `MockAttestor` server designed to bypass the real Circle Attestation API during local integration testing.

## Features

- **State Machine Architecture**: Every transfer is tracked through a strict lifecycle (`IDLE` -> `APPROVED` -> `BURNED` -> `ATTESTED` -> `COMPLETE`). This prevents race conditions and makes transfers resumable if the user drops off or the browser crashes.
- **CCTP v2 Hooks**: Built-in encoders to forward transferred USDC directly into Vaults (ERC4626), execute Uniswap v3 swaps on the destination chain, or pay external contracts.
- **Viem Native**: Fully built on `viem` for lightweight, reliable, and type-safe EVM interactions.
- **Fee Estimation**: Predict gas costs and Circle bridge fees before initiating a transaction.

## Installation

To install the dependencies and build the packages locally:

```bash
# Install dependencies across all workspaces
pnpm install

# Build all packages (Core, React, Hardhat Plugin)
pnpm run build
```

## How to Implement (Usage)

### 1. Using the Core SDK (Node.js / Vanilla JS)

```typescript
import { CctpClient, TransferState, Hooks } from "@arc/cctp-sdk";
import { createWalletClient, http, custom } from "viem";
import { mainnet } from "viem/chains";

// Initialize the client
const cctpClient = new CctpClient({ env: "mainnet" });

// Setup Viem WalletClient
const sourceWallet = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum)
});

async function runTransfer() {
  const transfer = await cctpClient.transfer({
    sourceChain: "ethereum",
    destinationChain: "arbitrum",
    amount: 100000000n, // 100 USDC (6 decimals)
    fast: true, // Use CCTP v2 fast lane
    // Optional: Deposit directly into a vault on the destination chain!
    hook: Hooks.depositToVault({ vaultAddress: "0xVaultAddress..." })
  }, sourceWallet);

  // Listen to state changes
  transfer.on("stateChange", (snapshot) => {
    console.log("Current state:", snapshot.state);
    if (snapshot.state === TransferState.BURNED) {
      console.log("Burn TX Hash:", snapshot.sourceTxHash);
    }
  });

  // Wait for the entire transfer to complete (Burn -> Attest -> Relay)
  const finalSnapshot = await transfer.wait();
  console.log("Transfer Complete! Relay Hash:", finalSnapshot.destinationTxHash);
}
```

### 2. Using React Hooks

The `@arc/cctp-sdk-react` package provides seamless hooks for your frontend.

```tsx
import { useTransfer, useEstimateFee } from "@arc/cctp-sdk-react";
import { useWalletClient } from "wagmi";

export function BridgeComponent() {
  const { data: walletClient } = useWalletClient();
  const { transfer, state, isLoading, error } = useTransfer();
  
  const { estimate, loading: estimateLoading } = useEstimateFee({
    sourceChain: "ethereum",
    destinationChain: "base",
    amount: 50000000n, // 50 USDC
    fast: true
  });

  const handleBridge = async () => {
    if (!walletClient) return;
    await transfer({
      sourceChain: "ethereum",
      destinationChain: "base",
      amount: 50000000n,
      fast: true
    }, walletClient);
  };

  return (
    <div>
      <button onClick={handleBridge} disabled={isLoading}>
        {isLoading ? `Bridging... (${state})` : "Bridge 50 USDC"}
      </button>
      {error && <p className="text-red-500">Error: {error.message}</p>}
    </div>
  );
}
```

## Testing & Local Development

Circle's Attestation API requires real transactions to generate signatures. For local development or CI/CD pipelines, this SDK includes a Hardhat plugin that spins up a `MockAttestor`.

1. Import the mock attestor in your test setup:
```typescript
import { startMockAttestor } from "@arc/cctp-sdk-hardhat";

let stopAttestor: () => void;

beforeAll(async () => {
  stopAttestor = await startMockAttestor(3001);
});

afterAll(() => {
  stopAttestor();
});
```

2. Point your `CctpClient` to the local mock server during tests:
```typescript
const testClient = new CctpClient({
  env: "testnet",
  attestationApiUrl: "http://localhost:3001" // Point to the MockAttestor
});
```

## Important Information

- **Arc Chain Placeholders**: The `chains.ts` file in the core package currently uses placeholder addresses for the Arc network. Before deploying to production, ensure that the `domain`, `tokenMessenger`, `messageTransmitter`, and `usdc` contract addresses are updated with the official Arc network deployments.
- **Decimals**: Always remember that USDC operates with **6 decimals**. (e.g., $1 = `1000000n`).
- **Resumability**: The SDK is designed to be fully resumable. The `Transfer` state machine currently defines a `persistState` stub. You can implement your own caching layer (like `localStorage` in the browser or SQLite on the backend) to cache the `transferId` and `messageBytes` to prevent users from losing funds if they close the tab during bridging.
