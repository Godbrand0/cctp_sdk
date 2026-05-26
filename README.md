# Arc CCTP v2 SDK

A production-grade TypeScript SDK for Circle's Cross-Chain Transfer Protocol (CCTP) v2. Reduces a 7-step manual integration to a single function call — with built-in approval, burn, attestation polling, and relay.

Built on **Viem v2+** with a strict state machine so transfers are always resumable.

## Why

Manual CCTP v2 integration requires:
1. Check and submit USDC approval
2. Call `depositForBurn` with 7 arguments
3. Extract `MessageSent` event from the receipt
4. Poll Circle's attestation API until status is `complete`
5. Use Iris-provided message bytes (raw event bytes have a zero nonce in v2)
6. Submit `receiveMessage` on the destination chain
7. Wait for confirmation

This SDK does all of it in one call.

## Packages

| Package | Description |
|---|---|
| `@arc/cctp-sdk` | Core state machine, `CctpClient`, hook encoder, fee estimator |
| `@arc/cctp-sdk-react` | React hooks — `useTransfer`, `useEstimateFee` |
| `@arc/cctp-sdk-hardhat` | `MockAttestor` server for local integration testing |

## Installation

```bash
pnpm install
pnpm run build
```

## Usage

### Basic transfer

```typescript
import { CctpClient } from "@arc/cctp-sdk";
import { createWalletClient, http, parseUnits } from "viem";
import { mainnet } from "viem/chains";

const client = new CctpClient({ env: "mainnet" });

const wallet = createWalletClient({
  chain: mainnet,
  transport: http(),
});

const transfer = await client.transfer(
  {
    from: "ethereum",
    to: "base",
    amount: parseUnits("10", 6), // 10 USDC
    fast: true,
  },
  wallet
);

transfer.on("stateChange", (snap) => {
  console.log(snap.state, snap.sourceTxHash ?? "");
});

const result = await transfer.wait();
console.log("Complete:", result.destinationTxHash);
```

### With a chain allowlist

Declare which chains your app supports. The client throws if `from`/`to` isn't in the list.

```typescript
const client = new CctpClient({
  env: "testnet",
  chains: ["base", "arbitrum", "ethereum"],
});
```

### With a destination hook

Execute a contract call on the destination chain at mint time — useful for auto-depositing into vaults or swapping.

```typescript
import { Hooks } from "@arc/cctp-sdk";

const transfer = await client.transfer(
  {
    from: "base",
    to: "arbitrum",
    amount: parseUnits("50", 6),
    fast: true,
    hook: Hooks.depositToVault({ vaultAddress: "0x..." }),
  },
  wallet
);
```

### Resume an interrupted transfer

```typescript
const transfer = await client.resume(transferId, wallet);
const result = await transfer.wait();
```

### React

```tsx
import { useTransfer } from "@arc/cctp-sdk-react";
import { useWalletClient } from "wagmi";

export function BridgeButton() {
  const { data: wallet } = useWalletClient();
  const { transfer, state, isLoading, error } = useTransfer();

  return (
    <button
      disabled={isLoading}
      onClick={() =>
        transfer({ from: "ethereum", to: "base", amount: parseUnits("10", 6), fast: true }, wallet!)
      }
    >
      {isLoading ? `${state}…` : "Bridge 10 USDC"}
    </button>
  );
}
```

## Supported chains

### Mainnet

| Chain | Chain ID | CCTP Domain |
|---|---|---|
| Ethereum | 1 | 0 |
| Avalanche | 43114 | 1 |
| Optimism | 10 | 2 |
| Arbitrum | 42161 | 3 |
| Base | 8453 | 6 |
| Polygon | 137 | 7 |
| Unichain | 130 | 10 |
| Linea | 59144 | 11 |
| Sonic | 146 | 13 |
| World Chain | 480 | 14 |

### Testnet

| Chain | Chain ID | CCTP Domain |
|---|---|---|
| Ethereum Sepolia | 11155111 | 0 |
| Avalanche Fuji | 43113 | 1 |
| OP Sepolia | 11155420 | 2 |
| Arbitrum Sepolia | 421614 | 3 |
| Base Sepolia | 84532 | 6 |
| Polygon Amoy | 80002 | 7 |
| Unichain Sepolia | 1301 | 10 |
| Linea Sepolia | 59141 | 11 |
| Sonic Testnet | 57054 | 13 |
| World Chain Sepolia | 4801 | 14 |
| Monad Testnet | 10143 | 15 |
| Arc Testnet | 5042002 | 26 |

## Transfer states

```
IDLE → APPROVING → APPROVED → BURNING → BURNED → AWAITING_ATTESTATION → ATTESTED → RELAYING → COMPLETE
                                                                                              ↘ FAILED (from any state)
```

## Running the testnet example

```bash
cp .env.example .env   # add your private key
pnpm example:transfer
```

Transfers 3 USDC from Base Sepolia to Arc testnet using the fast lane (~30 seconds).

## Local testing

```typescript
import { startMockAttestor } from "@arc/cctp-sdk-hardhat";

let stop: () => void;
beforeAll(async () => { stop = await startMockAttestor(3001); });
afterAll(() => stop());

const client = new CctpClient({
  env: "testnet",
  attestationApiUrl: "http://localhost:3001",
});
```

## Notes

- **USDC decimals**: 6 on all chains except Arc testnet (18 — USDC is the native gas token). Check `ChainConfig.usdcDecimals` or use `TESTNET_CHAINS.arc.usdcDecimals`.
- **Fast lane fee**: Circle charges a minimum fee (~1.3 USDC) for fast transfers. The SDK fetches the current minimum automatically from the Iris API — set `fast: true` and it handles the rest.
- **Message bytes**: CCTP v2 raw event logs encode the nonce as zero. The SDK uses Iris-provided message bytes for the relay call.
- **Resumability**: Transfer state is persisted to `localStorage` (browser) or `/tmp` (Node). Use `client.resume(transferId, wallet)` to continue an interrupted transfer.
