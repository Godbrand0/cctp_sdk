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
| 1 | Attestation meets the threshold of attesters enabled on Circle's MessageTransmitter (read live) | `InvalidAttestation` (101), `InvalidConfig` (102) if Circle reports no threshold |
| 2 | Destination domain is 27 | `WrongDestination` (103) |
| 3 | Forward-to address is this contract | `WrongForwardTo` (104) |
| 4 | Mint recipient is Circle's CctpForwarder | `WrongMintRecipient` (105) |
| 5 | `is_nonce_used` on Circle's MessageTransmitter (the mint happened) | `NotMinted` (1) |
| 6 | Read the recipient and `min_out` from the hookData | `MalformedMessage` (100) |
| 7 | Nonce not already delivered here; record it | `AlreadyDelivered` (106) |
| 8 | Pay `(amount - feeExecuted) * 10` (Stellar USDC has 7 decimals) | |

The attester set and threshold come from Circle's own MessageTransmitter on every call. They follow Circle's
rotations automatically, and no admin can add a key.

Any failed step reverts the whole call, nonce record included, so the call can be retried after the cause is fixed.
For example, calling before the mint returns `NotMinted`, and calling again once the mint has happened succeeds.

## Delivery

| Config | Result | `Outcome` |
|---|---|---|
| No action | USDC sent to the recipient | `Delivered` |
| Action succeeds and pulls the full amount | Action's output goes to the recipient | `Executed` |
| Action fails, or its `min_out` floor isn't met | Action rolled back; USDC sent to the recipient | `Fallback` |
| Action succeeds but pulls less than the amount | Remainder sent to the recipient | `Fallback` |

A failing action can't strand a deposit: the user gets plain USDC instead.

## Recovery

`recover(message, attestation, to)` is admin-only and exists for one case: a message that is genuine, minted to this
contract and undelivered, but whose recipient section is missing or malformed (including a muxed `M...` recipient or
a mistyped strkey), so `process` can never succeed. It runs the same checks 1-5, refuses any message `process` can
handle (`Processable`, error 2), records the nonce and sends the delivered amount to `to`. A normal deposit can't be
redirected through it.

## Action interface

```rust
fn execute(env: Env, from: Address, recipient: Address, amount: i128, min_out: i128);
```

The receiver approves `amount` USDC to the action, calls `execute`, then sets the allowance back to zero. The action
pulls the USDC with `transfer_from(action, from, ..., amount)`, delivers its output to `recipient`, and **must panic if
it can't deliver at least `min_out`**. The receiver can't check the output asset itself.

## Admin

`set_action`, `set_admin`, `recover`. The admin can't touch the attester set or redirect a normal deposit. It is
still trusted in two ways: the action contract it picks receives every payout first, so a malicious action could
take funds, and it chooses where recovered funds go. Use a multisig or a contract you govern as the admin, and an
action contract you've reviewed.

## Known gaps

| Case | Effect |
|---|---|
| Recipient is a `G...` account with no USDC trustline | `process` fails until the recipient adds one, then succeeds on retry |
| Trailing hookData missing or malformed, or recipient is a muxed `M...` address | `process` fails with `MalformedMessage`; the admin can `recover` it |
| Recipient never adds a trustline | Stays here: `recover` refuses a message `process` could handle |
| Admin key compromised | It can set a malicious action, which would take later payouts (see Admin) |

## Deploy

```bash
cargo build -p cctp-receiver --target wasm32v1-none --release
stellar contract deploy --wasm target/wasm32v1-none/release/cctp_receiver.wasm --source <identity> --network testnet -- \
  --admin <G...> --usdc <USDC SAC> --forwarder <CctpForwarder id, 32-byte hex> \
  --message_transmitter <C...>
```

Relay with `@cctp-sdk/stellar`:

```ts
consumer: { contractId: RECEIVER, method: "process", isDeliveredMethod: "is_delivered" }
```
