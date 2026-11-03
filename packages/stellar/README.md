# @cctp-sdk/stellar

Receive Circle CCTP V2 USDC on Stellar with a **recipient bound inside Circle's attestation**.

Extracted from [Conduit](https://github.com/Godbrand0/conduit), where this design is proven on testnet
(Arbitrum Sepolia → Stellar, one user signature). Status: **pre-alpha**.

## The problem

Circle's `CctpForwarder` on Stellar only mints USDC and forwards it to a plain
address. It cannot run a hook, so anything that needs to know *who a deposit is
for* (an anchor, a wallet, a swap) has to trust whoever relays the message.

## The approach

The burn's `hookData` carries Circle's forwarder format followed by a trailing
section (final recipient + minimum-output floor). The forwarder ignores the
trailing bytes; a consumer contract re-parses the same attested message and
reads them, so the recipient cannot be changed by the relayer.

## What's included

| Module | Purpose |
|---|---|
| `encodeAttributedHookData` / `parseAttributedHookData` | Build and read the hookData layout |
| `parseCctpV2Message` | Decode a CCTP V2 burn message (header, body, hookData) |
| `STELLAR_TESTNET` / `STELLAR_MAINNET` | Contract addresses and domain (27) |
| `StellarRelayer` | Poll attestation, call `mint_and_forward`, then an optional consumer contract. Resumable and idempotent; validates domain and mint recipient before spending any fee |
| `Signer` / `KeypairSigner` | Pluggable signing. Implement `Signer` against a KMS for real funds |
| `RelayStore` / `MemoryStore` | Persist progress so a crash resumes instead of repeating a step |
| `IrisClient` | Minimal attestation poller; `AttestationClient` from `@cctp-sdk/core` also works |

The on-chain half is the Rust crate in [`/crates/attested-receiver`](../../crates/attested-receiver)
(attestation verification and message parsing for Soroban contracts). A test there parses a
hookData vector produced by this package's encoder, so the two stay in sync.

```ts
const relayer = new StellarRelayer({
  network: STELLAR_TESTNET,
  invoker: new RpcInvoker({ rpcUrl, passphrase: STELLAR_TESTNET.passphrase, signer: new KeypairSigner(secret) }),
  attestations: new IrisClient(IRIS_SANDBOX),
  consumer: { contractId: MY_RECEIVER, method: "deliver" },
});
await relayer.relay(burnTxHash, sourceDomain);
```

Not yet: source-side burn helpers, anchor memo attribution.

## Caveats

- `STELLAR_MAINNET.cctpForwarder` comes from Circle's docs and has **not been verified on-chain** here.
- The trailing hookData section is a convention, not part of Circle's spec. It relies on
  `mint_and_forward` tolerating trailing bytes, observed on testnet only.
- `RpcInvoker`, the live Soroban path, has not been run against a network yet. The relay logic is tested against a fake invoker only.
- Recipients are restricted to `G...` and `C...` strkeys. Muxed (`M...`) and memo attribution are untested.

## Develop

```bash
pnpm install && pnpm test && pnpm build
```

## Roadmap

1. External audit of `attested-receiver`.
2. A KMS-backed `Signer` and a persistent `RelayStore`.
3. Anchor attribution: map deposits to SEP-24/SEP-6 transactions via memo or muxed IDs; feed the CCTP pre-SEP.
