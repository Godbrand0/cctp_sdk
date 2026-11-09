#![no_std]
//! Verify Circle CCTP V2 attestations and read attested hookData inside a
//! Soroban contract.
//!
//! Circle's Stellar `CctpForwarder` mints USDC and transfers it to the
//! address in the hookData. That address is attested, so it can't be
//! redirected, but the forwarder never invokes it. A contract that has to act
//! for a specific user (swap with a floor, vault deposit, anchor credit)
//! therefore receives the same attested message in a second call and reads
//! its per-user instructions from a trailing hookData section. That is only
//! safe if the contract authenticates the bytes and ties them to funds it
//! actually received:
//!
//! * [`attestation::verify`]: threshold ECDSA over keccak256(message), as
//!   Circle's EVM `MessageTransmitter` does.
//! * [`message`]: bounds-checked readers for the CCTP V2 burn message, Circle's
//!   forward-to address and the trailing `recipient + min_out` section (see
//!   the `@cctp-sdk/stellar` npm package for the matching encoder).
//!
//! This crate holds no funds. Apart from [`delivered`], which writes to the
//! calling contract's own storage, it holds no state either. A consumer's
//! delivery function must, in this order:
//!
//! 1. [`attestation::verify`] the message, or [`attestation::verify_with`]
//!    against Circle's MessageTransmitter (`is_enabled_attester`,
//!    `get_signature_threshold`) so no admin controls the attester set.
//! 2. [`message::require_destination_domain`] with 27 (Stellar).
//! 3. [`message::require_forward_to`] with its own address. Otherwise a valid
//!    message whose USDC went elsewhere is paid out of other users' funds.
//! 4. [`message::require_mint_recipient`] with the CctpForwarder's id.
//! 5. Check the nonce with `is_nonce_used` on Circle's MessageTransmitter,
//!    which proves the mint happened.
//! 6. [`delivered::claim`] the nonce *before* paying out.
//! 7. Read [`message::attributed_hook`] and act on it, paying
//!    [`message::delivered_amount`] (`(amount - feeExecuted) * 10`, since
//!    Stellar USDC has 7 decimals), never the raw message `amount`.
//!
//! The `cctp-receiver` contract in this workspace does all of this and can
//! be deployed as is.
//!
//! Admin auth is the consumer's job, as is the attester set if it uses
//! [`attestation::verify`] rather than [`attestation::verify_with`].
//!
//! **Status: unaudited.** Ported from Conduit's `swap_and_deliver`, whose own
//! internal audit found two critical bugs in this logic before it was fixed.

pub mod attestation;
pub mod delivered;
pub mod message;

use soroban_sdk::contracterror;

/// Codes start at 100 so a consumer can return this type directly from a
/// contract function without clashing with its own small error codes.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum Error {
    MalformedMessage = 100,
    InvalidAttestation = 101,
    InvalidConfig = 102,
    WrongDestination = 103,
    WrongForwardTo = 104,
    WrongMintRecipient = 105,
    AlreadyDelivered = 106,
}
