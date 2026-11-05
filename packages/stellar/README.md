# @cctp-sdk/stellar

Let a Soroban contract act on inbound Circle CCTP V2 USDC **for a specific user**, using instructions that are part of Circle's attested message.

Extracted from [Conduit](https://github.com/Godbrand0/conduit), where this design is proven on testnet
(Arbitrum Sepolia → Stellar, one user signature). Status: **pre-alpha**.

## The problem

A burn bound for Stellar targets Circle's `CctpForwarder`, and the forwarding
address goes in `hookData`. That address is part of the attested message, so a
relayer can't redirect the funds. If you are sending USDC straight to a user's
own account, you don't need this package.

The forwarder *transfers* USDC to that address but never *invokes* it. When the
destination is a contract that has to do something for a particular user (swap
into another asset with a slippage floor, deposit into a vault, credit a user
at an anchor), Circle's format has no field for who the deposit is for or what
floor applies. The contract just sees USDC arrive.

## The approach

The burn's `hookData` carries Circle's forwarder format followed by a trailing
section (final recipient + minimum-output floor). The forwarder ignores the
trailing bytes. The consumer contract is called with the same attested message,
verifies it, and reads its per-user instructions from it. This is the Stellar
counterpart of destination hooks in `@cctp-sdk/core`.

A consumer must check, in order: the attestation, destination domain 27, that
the forward-to address is itself, that the mint recipient is the forwarder,
`is_nonce_used` on Circle's MessageTransmitter, and its own delivered-nonce map
(recorded before paying out). The [`attested-receiver`](../../crates/attested-receiver)
crate provides each check.

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
