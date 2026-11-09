#![no_std]
//! Reference receiver for inbound CCTP V2 USDC on Stellar.
//!
//! Deploy this contract and use its address as the `forwardRecipient` in the
//! burn's hookData. Circle's `CctpForwarder` mints the USDC here; then anyone
//! (a relayer, the user, a keeper) calls [`Receiver::process`] with the same
//! message and attestation, at any time, and the contract:
//!
//! 1. runs every check from the `attested-receiver` checklist, verifying the
//!    attestation against the attester set on Circle's own MessageTransmitter,
//! 2. records the nonce so the deposit can never be paid twice,
//! 3. pays `(amount - feeExecuted) * 10` to the attested recipient, either
//!    through the configured action contract or directly.
//!
//! If the action fails for any reason (including its `min_out` floor not
//! being met), its state changes are rolled back and the plain USDC goes to
//! the attested recipient instead. If the hookData's recipient section is
//! missing or malformed, so the message can never be processed, the admin
//! can [`Receiver::recover`] it. Nothing else lets the admin move funds.
//!
//! **Status: unaudited.**

use attested_receiver::{attestation, delivered, message, Error};
use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Bytes, BytesN, Env,
};

/// Stellar's CCTP domain.
pub const STELLAR_DOMAIN: u32 = 27;

/// What an action contract must implement.
///
/// The receiver approves `from`'s USDC to the action for exactly `amount`
/// (7-decimal units) and calls `execute`. The action pulls the USDC with
/// `transfer_from` and delivers its output to `recipient`. It **must** panic
/// if it can't give at least `min_out`; the receiver then rolls it back and
/// sends the plain USDC to `recipient`. Any USDC it leaves unpulled is also
/// sent to `recipient`.
#[contractclient(name = "ActionClient")]
pub trait Action {
    fn execute(env: Env, from: Address, recipient: Address, amount: i128, min_out: i128);
}

/// The parts of Circle's Stellar MessageTransmitter this contract reads.
/// Signatures match the deployed contract's interface.
#[contractclient(name = "TransmitterClient")]
pub trait Transmitter {
    fn is_nonce_used(env: Env, nonce: BytesN<32>) -> bool;
    fn is_enabled_attester(env: Env, attester: BytesN<20>) -> bool;
    fn get_signature_threshold(env: Env) -> Option<u32>;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Outcome {
    /// No action configured; USDC sent to the recipient.
    Delivered,
    /// The action ran and pulled the full amount.
    Executed,
    /// The action failed; USDC sent to the recipient.
    Fallback,
}

#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub usdc: Address,
    /// Circle's CctpForwarder contract id (the message's mintRecipient).
    pub forwarder: BytesN<32>,
    /// Circle's MessageTransmitter: source of the attester set and threshold,
    /// and asked whether the nonce was minted.
    pub message_transmitter: Address,
    pub action: Option<Address>,
}

#[contracttype]
enum Key {
    Config,
}

/// Errors only this contract raises. Codes from `attested-receiver` start
/// at 100, so these don't collide.
#[soroban_sdk::contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ReceiverError {
    /// The attested message hasn't been minted yet (or never will be).
    NotMinted = 1,
    /// `recover` was called on a message that `process` can handle.
    Processable = 2,
}

const INSTANCE_TTL_THRESHOLD: u32 = 500_000;
const INSTANCE_TTL_EXTEND_TO: u32 = 3_000_000;

#[contract]
pub struct Receiver;

#[contractimpl]
impl Receiver {
    pub fn __constructor(
        env: Env,
        admin: Address,
        usdc: Address,
        forwarder: BytesN<32>,
        message_transmitter: Address,
        action: Option<Address>,
    ) {
        let config = Config { admin, usdc, forwarder, message_transmitter, action };
        env.storage().instance().set(&Key::Config, &config);
    }

    /// Verify an attested CCTP message whose USDC was forwarded here, and
    /// deliver it. Permissionless: the attested hookData decides who is paid,
    /// so the caller can't change the outcome, and can only call it once per
    /// message.
    pub fn process(env: Env, message: Bytes, attestation: Bytes) -> Result<Outcome, Error> {
        let config = config(&env);
        let me = env.current_contract_address();
        let nonce = authenticate(&env, &config, &message, &attestation)?;

        // Read the instructions before claiming, so a malformed message
        // stays unclaimed and can still be recovered.
        let hook = message::attributed_hook(&env, &message)?;
        let amount = message::delivered_amount(&message)?;
        delivered::claim(&env, &nonce)?;

        let usdc = token::TokenClient::new(&env, &config.usdc);
        let outcome = match &config.action {
            None => {
                usdc.transfer(&me, &hook.recipient, &amount);
                Outcome::Delivered
            }
            Some(action) => {
                let before = usdc.balance(&me);
                usdc.approve(&me, action, &amount, &env.ledger().sequence());
                let ok = matches!(
                    ActionClient::new(&env, action).try_execute(&me, &hook.recipient, &amount, &hook.min_out),
                    Ok(Ok(()))
                );
                usdc.approve(&me, action, &0, &env.ledger().sequence());
                let pulled = before - usdc.balance(&me);
                let left = amount - pulled;
                if left > 0 {
                    usdc.transfer(&me, &hook.recipient, &left);
                }
                if ok && left == 0 {
                    Outcome::Executed
                } else {
                    Outcome::Fallback
                }
            }
        };

        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
        env.events()
            .publish((symbol_short!("delivered"), nonce), (hook.recipient, amount, outcome.clone()));
        Ok(outcome)
    }

    /// Admin-only escape hatch for a message that is genuine, minted to this
    /// contract and undelivered, but whose recipient section is missing or
    /// malformed, so `process` can never succeed. Sends its delivered amount
    /// to `to` and records the nonce. Refuses any message `process` can
    /// handle, so it can't be used to redirect a normal deposit.
    pub fn recover(env: Env, message: Bytes, attestation: Bytes, to: Address) -> Result<i128, Error> {
        let config = admin_config(&env);
        let nonce = authenticate(&env, &config, &message, &attestation)?;
        if message::attributed_hook(&env, &message).is_ok() {
            panic_with_error!(&env, ReceiverError::Processable);
        }
        let amount = message::delivered_amount(&message)?;
        delivered::claim(&env, &nonce)?;
        token::TokenClient::new(&env, &config.usdc).transfer(&env.current_contract_address(), &to, &amount);
        env.events().publish((symbol_short!("recovered"), nonce), (to, amount));
        Ok(amount)
    }

    pub fn is_delivered(env: Env, nonce: BytesN<32>) -> bool {
        delivered::is_delivered(&env, &nonce)
    }

    pub fn config(env: Env) -> Config {
        config(&env)
    }

    pub fn set_action(env: Env, action: Option<Address>) {
        let mut c = admin_config(&env);
        c.action = action;
        env.storage().instance().set(&Key::Config, &c);
    }

    pub fn set_admin(env: Env, admin: Address) {
        let mut c = admin_config(&env);
        c.admin = admin;
        env.storage().instance().set(&Key::Config, &c);
    }
}

/// Checklist steps 1-5: authentic (per Circle's live attester set), for
/// Stellar, forwarded to this contract, via the forwarder, and minted.
/// Returns the nonce.
fn authenticate(env: &Env, config: &Config, message: &Bytes, attestation: &Bytes) -> Result<BytesN<32>, Error> {
    let mt = TransmitterClient::new(env, &config.message_transmitter);
    let threshold = mt.get_signature_threshold().ok_or(Error::InvalidConfig)?;
    attestation::verify_with(env, message, attestation, threshold, |a| mt.is_enabled_attester(a))?;
    message::require_destination_domain(message, STELLAR_DOMAIN)?;
    message::require_forward_to(env, message, &env.current_contract_address())?;
    message::require_mint_recipient(message, &config.forwarder)?;
    let nonce = message::nonce(message)?;
    if !mt.is_nonce_used(&nonce) {
        panic_with_error!(env, ReceiverError::NotMinted);
    }
    Ok(nonce)
}

fn config(env: &Env) -> Config {
    env.storage().instance().get(&Key::Config).unwrap()
}

fn admin_config(env: &Env) -> Config {
    let c = config(env);
    c.admin.require_auth();
    c
}
