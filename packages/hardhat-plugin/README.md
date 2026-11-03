# @cctp-sdk/hardhat

Helpers for testing CCTP transfers locally, without Circle's attestation API.

```bash
npm install --save-dev @cctp-sdk/hardhat
```

## Mock attestor

`startMockAttestor(port = 3001)` starts an Express server that signs any message hash immediately and returns a stop function. Point the client at it with `attestationApiUrl`.

```typescript
import { startMockAttestor } from "@cctp-sdk/hardhat";
import { CctpClient } from "@cctp-sdk/core";

const stop = await startMockAttestor(3001);
const client = new CctpClient({ env: "testnet", attestationApiUrl: "http://localhost:3001" });
// ... run your transfer ...
stop();
```

## Fork helpers

All take the Hardhat runtime environment as the first argument.

| Function | Description |
|---|---|
| `resetNetworkFork(hre, jsonRpcUrl, blockNumber?)` | Reset the local network to a fork of `jsonRpcUrl`. |
| `impersonateAccount(hre, address)` / `stopImpersonatingAccount(hre, address)` | Send transactions as any address. |
| `deployMockCctp(hre, tokenMessenger, messageTransmitter)` | Replace the code at the given addresses with minimal mock CCTP contracts via `hardhat_setCode`. |

These are test utilities. The mock contracts implement only what a local transfer needs and are not a faithful copy of Circle's contracts.
