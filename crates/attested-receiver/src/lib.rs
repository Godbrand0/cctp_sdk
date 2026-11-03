#![no_std]
//! Verify Circle CCTP V2 attestations and read attested hookData inside a
//! Soroban contract.
//!
//! Circle's Stellar `CctpForwarder` mints USDC and forwards it to a plain
//! address; it cannot run a hook. A contract that wants to know who a deposit
//! is *for* therefore receives the same attested message a second time and
//! reads the recipient out of the hookData. That is only safe if the contract
//! authenticates the message bytes itself, which is what this crate does:
//!
//! * [`attestation::verify`] — threshold ECDSA over keccak256(message), as
//!   Circle's EVM `MessageTransmitter` does.
//! * [`message`] — bounds-checked readers for the CCTP V2 burn message and the
//!   trailing `recipient + min_out` section (see the `@cctp-sdk/stellar` npm
//!   package for the matching encoder).
//!
//! This crate holds no storage and no funds. Replay protection (a delivered
//! nonce map), the `is_nonce_used` check against Circle's MessageTransmitter,
//! attester-set management and admin auth are the consumer's responsibility.
//!
//! **Status: unaudited.** Ported from Conduit's `swap_and_deliver`, whose own
//! internal audit found two critical bugs in this logic before it was fixed.

pub mod attestation;
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
}
