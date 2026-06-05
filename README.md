# @cctp-sdk/core

A production-grade TypeScript SDK for Circle's [Cross-Chain Transfer Protocol (CCTP) v2](https://developers.circle.com/cctp). Reduces a 7-step manual integration to a single function call — with built-in USDC approval, burn, attestation polling, and relay.

Built on **Viem v2+** with a strict state machine so transfers are always resumable.

```bash
npm install @cctp-sdk/core
```

> `viem` is a peer dependency — install it if you haven't: `npm install viem`

---

## Why

Raw CCTP v2 requires you to:

1. Check allowance and submit USDC approval
2. Call `depositForBurn` with 7 arguments
3. Extract the `MessageSent` event from the receipt
4. Poll Circle's Iris attestation API until status is `complete`
5. Use Iris-provided message bytes (raw event bytes have a zero nonce bug in v2)
6. Submit `receiveMessage` on the destination chain
7. Wait for confirmation

This SDK handles all of it in one call.

---

## Quick start

```typescript
import { CctpClient } from "@cctp-sdk/core";
import { createWalletClient, http, parseUnits } from "viem";
import { mainnet } from "viem/chains";

const client = new CctpClient({ env: "mainnet" });

const wallet = createWalletClient({
  chain: mainnet,
  transport: http("https://your-rpc-url"),
});

const transfer = await client.transfer(
  {
    from: "ethereum",
    to: "base",
    amount: parseUnits("10", 6), // 10 USDC
    fast: true,                  // CCTP v2 fast lane (~2s attestation)
  },
  wallet
);

// Listen to every state transition
transfer.on("stateChange", (snap) => {
  console.log(snap.state);
  if (snap.sourceTxHash) console.log("Burn tx:", snap.sourceTxHash);
  if (snap.destinationTxHash) console.log("Relay tx:", snap.destinationTxHash);
});

const result = await transfer.wait();
console.log("Done:", result.destinationTxHash);
```

---

## Configuration

```typescript
const client = new CctpClient({
  // "mainnet" (default) or "testnet"
  env: "testnet",

  // Optional: restrict which chains this client can use
  chains: ["base", "arbitrum", "ethereum"],

  // Optional: override Circle's attestation API URL
  attestationApiUrl: "https://iris-api-sandbox.circle.com",

  // Optional: per-chain RPC overrides (keyed by chain name)
  rpcs: {
    base: "https://mainnet.base.org",
    ethereum: "https://eth.llamarpc.com",
  },

  // Optional: max attestation poll attempts (default: 60)
  maxAttestationAttempts: 60,

  // Optional: poll interval in ms — 0 uses exponential backoff (default)
  pollIntervalMs: 0,
});
```

---

## Transfer params

| Field | Type | Required | Description |
|---|---|---|---|
| `from` | `SupportedChain` | Yes | Source chain name (e.g. `"base"`) |
| `to` | `SupportedChain` | Yes | Destination chain name (e.g. `"arbitrum"`) |
| `amount` | `bigint` | Yes | Amount in USDC base units (`parseUnits("10", 6)` = 10 USDC) |
| `fast` | `boolean` | No | Use CCTP v2 fast lane. Fetches minimum fee from Iris automatically. |
| `recipient` | `Address` | No | Override recipient on destination. Defaults to sender. |
| `maxFee` | `bigint` | No | Override fast lane fee. Auto-fetched from Iris if omitted. |
| `hook` | `TransferHook` | No | Execute a contract call at mint time on the destination chain. |

---

## Transfer states

```
IDLE → APPROVING → APPROVED → BURNING → BURNED → AWAITING_ATTESTATION → ATTESTED → RELAYING → COMPLETE
                                                                                          ↘ FAILED
```

Every state transition emits a `stateChange` event with a `TransferStateSnapshot`:

```typescript
type TransferStateSnapshot = {
  state: TransferState;
  transferId: string;
  sourceTxHash?: `0x${string}`;
  destinationTxHash?: `0x${string}`;
  messageBytes?: `0x${string}`;
  attestation?: `0x${string}`;
  error?: CctpError;
  updatedAt: number;
};
```

---

## Resume an interrupted transfer

Transfer state is persisted to `localStorage` (browser) or `/tmp` (Node.js). If the user closes the tab mid-transfer, resume with the `transferId`:

```typescript
const transfer = await client.resume(transferId, wallet);
const result = await transfer.wait();
```

---

## Destination hooks

Execute arbitrary contract logic on the destination chain at mint time — swap, deposit into a vault, pay a contract, etc.

```typescript
import { CctpClient, encodeHook } from "@cctp-sdk/core";

const transfer = await client.transfer(
  {
    from: "base",
    to: "arbitrum",
    amount: parseUnits("50", 6),
    fast: true,
    hook: {
      target: "0xYourContract",
      calldata: "0x...",
      forwardAmount: parseUnits("50", 6),
    },
  },
  wallet
);
```

---

## Check status from a tx hash

Recover transfer status from a burn transaction hash without a `transferId`:

```typescript
const snapshot = await client.getStatus(
  "0xYourBurnTxHash",
  "base"  // source chain
);
console.log(snapshot.state); // "ATTESTED" | "AWAITING_ATTESTATION" | etc.
```

---

## Fee estimation

```typescript
const fee = await client.estimateFee({
  from: "ethereum",
  to: "base",
  amount: parseUnits("100", 6),
  fast: true,
});

console.log("Gas (wei):", fee.gasCostWei.toString());
console.log("Bridge fee (USDC):", fee.bridgeFeeUsdc.toString());
console.log("Est. time:", fee.estimatedSeconds, "seconds");
```

---

## Supported chains

### Mainnet

| Key | Chain | Chain ID | CCTP Domain |
|---|---|---|---|
| `ethereum` | Ethereum | 1 | 0 |
| `avalanche` | Avalanche | 43114 | 1 |
| `optimism` | Optimism | 10 | 2 |
| `arbitrum` | Arbitrum | 42161 | 3 |
| `base` | Base | 8453 | 6 |
| `polygon` | Polygon | 137 | 7 |
| `unichain` | Unichain | 130 | 10 |
| `linea` | Linea | 59144 | 11 |
| `sonic` | Sonic | 146 | 13 |
| `worldchain` | World Chain | 480 | 14 |

### Testnet

| Key | Chain | Chain ID | CCTP Domain |
|---|---|---|---|
| `ethereum` | Ethereum Sepolia | 11155111 | 0 |
| `avalanche` | Avalanche Fuji | 43113 | 1 |
| `optimism` | OP Sepolia | 11155420 | 2 |
| `arbitrum` | Arbitrum Sepolia | 421614 | 3 |
| `base` | Base Sepolia | 84532 | 6 |
| `polygon` | Polygon Amoy | 80002 | 7 |
| `unichain` | Unichain Sepolia | 1301 | 10 |
| `linea` | Linea Sepolia | 59141 | 11 |
| `sonic` | Sonic Testnet | 57054 | 13 |
| `worldchain` | World Chain Sepolia | 4801 | 14 |
| `monad` | Monad Testnet | 10143 | 15 |
| `arc` | Arc Testnet | 5042002 | 26 |

---

## Notes

- **USDC decimals**: 6 on all chains except Arc testnet (18 — USDC is the native gas token). Always check `ChainConfig.usdcDecimals` or use `TESTNET_CHAINS.arc.usdcDecimals`.
- **Fast lane fee**: Circle charges a minimum fee (~1.3 USDC on testnet) for fast transfers. Set `fast: true` and the SDK fetches the current minimum from Iris automatically.
- **Message bytes**: CCTP v2 raw event logs encode the nonce as zero. The SDK uses Iris-provided message bytes for the relay call to avoid this.
- **Two wallets**: Pass a second wallet client to `transfer()` if your source and destination signers are different (e.g. different chains on a hardware wallet).

---

## License

MIT
