# cctp-receiver

A Soroban contract you can deploy as is to receive inbound Circle CCTP V2 USDC on Stellar and deliver it to the
user named in the attested hookData. It is built on [`attested-receiver`](../attested-receiver).

**Status: unaudited, not deployed.** Tested against mocks only (see `tests/`).

## Flow

1. The burn on the source chain sets `forwardRecipient` = this contract, then appends the recipient and `min_out`
   (encode with `encodeAttributedHookData` from `@cctp-sdk/stellar`).
2. Circle's `CctpForwarder.mint_and_forward` mints the USDC to this contract.
3. **Anyone** calls `process(message, attestation)`, either straight away or later. The attested message decides who
   gets paid, so the caller can't change the result.

`process` runs, in order:

| Step | Check | Error |
|---|---|---|
| 1 | Attestation is a threshold of the configured attesters | `InvalidAttestation` (101) |
| 2 | Destination domain is 27 | `WrongDestination` (103) |
| 3 | Forward-to address is this contract | `WrongForwardTo` (104) |
| 4 | Mint recipient is Circle's CctpForwarder | `WrongMintRecipient` (105) |
| 5 | `is_nonce_used` on Circle's MessageTransmitter (the mint happened) | `NotMinted` (1) |
| 6 | Nonce not already delivered here; record it | `AlreadyDelivered` (106) |
| 7 | Pay `(amount - feeExecuted) * 10` (Stellar USDC has 7 decimals) | |

Any failed step reverts the whole call, nonce record included, so the call can be retried after the cause is fixed.
For example, calling before the mint returns `NotMinted`, and calling again once the mint has happened succeeds.

## Delivery

| Config | Result | `Outcome` |
|---|---|---|
| No action | USDC sent to the recipient | `Delivered` |
| Action succeeds and pulls the full amount | Action's output goes to the recipient | `Executed` |
| Action fails, or its `min_out` floor isn't met | Action rolled back; USDC sent to the recipient | `Fallback` |
| Action succeeds but pulls less than the amount | Remainder sent to the recipient | `Fallback` |

Once a message has been minted and processed, the USDC can't end up stuck in this contract.

## Action interface

```rust
fn execute(env: Env, from: Address, recipient: Address, amount: i128, min_out: i128);
```

The receiver approves `amount` USDC to the action, calls `execute`, then sets the allowance back to zero. The action
pulls the USDC with `transfer_from(action, from, ..., amount)`, delivers its output to `recipient`, and **must panic if
it can't deliver at least `min_out`**. The receiver can't check the output asset itself.

## Admin

`set_attesters` (mirror Circle's attester set), `set_action`, `set_admin`. The admin can choose the action contract,
so the admin is trusted with funds that pass through it. The admin can't redirect a delivery that falls back.

## Deploy

```bash
cargo build -p cctp-receiver --target wasm32v1-none --release
stellar contract deploy --wasm target/wasm32v1-none/release/cctp_receiver.wasm -- \
  --admin <G...> --usdc <USDC SAC> --forwarder <CctpForwarder id, 32-byte hex> \
  --message_transmitter <C...> --attesters '["<20-byte hex>", ...]' --threshold <n>
```

Relay with `@cctp-sdk/stellar`:

```ts
consumer: { contractId: RECEIVER, method: "process", isDeliveredMethod: "is_delivered" }
```
