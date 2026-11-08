//! Replay protection kept in the consumer contract's own storage.
//!
//! The record has to live in the contract that holds the funds: a shared
//! nonce registry would either let anyone mark a nonce (blocking real
//! deposits) or need its own auth scheme. Call [`claim`] after every other
//! check and *before* paying out.

use crate::Error;
use soroban_sdk::{contracttype, BytesN, Env};

/// Namespaced so it can't collide with the consumer's own storage keys.
#[contracttype]
#[derive(Clone)]
enum Key {
    CctpDelivered(BytesN<32>),
}

/// About a year at ~5s ledgers. An entry that is archived anyway can't be
/// replayed: reading an archived persistent entry fails until it is restored.
const TTL_THRESHOLD: u32 = 3_000_000;
const TTL_EXTEND_TO: u32 = 6_300_000;

pub fn is_delivered(env: &Env, nonce: &BytesN<32>) -> bool {
    env.storage().persistent().has(&Key::CctpDelivered(nonce.clone()))
}

/// Record `nonce` as delivered, or fail with [`Error::AlreadyDelivered`].
pub fn claim(env: &Env, nonce: &BytesN<32>) -> Result<(), Error> {
    let key = Key::CctpDelivered(nonce.clone());
    let store = env.storage().persistent();
    if store.has(&key) {
        return Err(Error::AlreadyDelivered);
    }
    store.set(&key, &true);
    store.extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    Ok(())
}
