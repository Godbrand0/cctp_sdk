# CCTP SDK

TypeScript tooling for Circle's [Cross-Chain Transfer Protocol (CCTP) v2](https://developers.circle.com/cctp): move USDC between chains with one function call, and let Stellar contracts act on inbound USDC for a specific user using Circle-attested instructions.

| Package | Version | What it is |
|---|---|---|
| [`@cctp-sdk/core`](packages/core) | 0.2.1 | The main SDK: approve, burn, attest and relay behind a resumable state machine. Fast lane, fee estimation, destination hooks. Built on viem. |
| [`@cctp-sdk/react`](packages/react) | 0.1.0 | `CctpProvider`, `useTransfer`, `useEstimateFee` and `TransferStatusBadge`. |
| [`@cctp-sdk/stellar`](packages/stellar) | 0.0.1 (pre-alpha) | Receive CCTP V2 USDC on Stellar: hookData codec, message parser, Iris client and a resumable relayer. |
| [`@cctp-sdk/hardhat`](packages/hardhat-plugin) | 0.1.0 | Local test helpers: a mock attestation server and fork utilities. |
| [`attested-receiver`](crates/attested-receiver) | crate | Soroban crate that verifies CCTP attestations and parses messages on-chain. |
| [`cctp-receiver`](crates/cctp-receiver) | contract | Deployable Soroban receiver: verifies, records the nonce, runs an action or falls back to plain USDC. |
| [`apps/web`](apps/web) | private | Next.js docs site with an interactive transfer simulator. |

## Quick start

```bash
npm install @cctp-sdk/core viem
```

```typescript
import { CctpClient } from "@cctp-sdk/core";
import { parseUnits } from "viem";

const client = new CctpClient({ env: "mainnet" });
const transfer = await client.transfer(
  { from: "ethereum", to: "base", amount: parseUnits("10", 6), fast: true },
  wallet
);
const result = await transfer.wait();
```

See the [`@cctp-sdk/core` README](packages/core/README.md) for configuration, transfer options, states, resume, hooks and the full chain list.

## Develop

Requires Node and pnpm.

```bash
pnpm install
pnpm build        # build every package
pnpm test
pnpm typecheck

pnpm --filter @cctp-sdk/web dev     # docs site
pnpm example:transfer               # testnet transfer, needs .env (see .env.example)
```

The Rust crates are a separate Cargo workspace in [`crates/`](crates): `cargo test` from that directory.

## License

MIT
