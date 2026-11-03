# @cctp-sdk/react

React bindings for [`@cctp-sdk/core`](../core).

```bash
npm install @cctp-sdk/react @cctp-sdk/core viem react
```

## Usage

```tsx
import { CctpProvider, useTransfer, useEstimateFee, TransferStatusBadge } from "@cctp-sdk/react";
import { parseUnits } from "viem";

function App() {
  return (
    <CctpProvider config={{ env: "testnet" }}>
      <Bridge />
    </CctpProvider>
  );
}

function Bridge() {
  const { transfer, state, sourceTxHash, destinationTxHash, error, isLoading, reset } = useTransfer();
  const { estimate, loading } = useEstimateFee({
    from: "base", to: "arbitrum", amount: parseUnits("10", 6), fast: true,
  });

  return (
    <>
      <TransferStatusBadge state={state} />
      <button
        disabled={isLoading}
        onClick={() => transfer({ from: "base", to: "arbitrum", amount: parseUnits("10", 6), fast: true }, wallet)}
      >
        Send 10 USDC
      </button>
    </>
  );
}
```

## API

| Export | Description |
|---|---|
| `CctpProvider` | Creates a `CctpClient` from `config` (same options as `new CctpClient(config)`). |
| `useCctpClient()` | Returns the client. Throws outside a `CctpProvider`. |
| `useTransfer()` | `transfer(params, wallet, destWallet?)` plus `state`, `sourceTxHash`, `destinationTxHash`, `error`, `isLoading`, `reset`. |
| `useEstimateFee(params \| null)` | Returns `{ estimate, loading }`. Pass `null` to skip. |
| `TransferStatusBadge` | Props: `state`, `className?`, `showIcon?`, `pulse?`. |

Peer dependencies: `react` and `react-dom` 18+, `viem` 2+, `@cctp-sdk/core`.
