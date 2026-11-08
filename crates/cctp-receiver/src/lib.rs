#![no_std]
//! Reference receiver for inbound CCTP V2 USDC on Stellar.
//!
//! Deploy this contract and use its address as the `forwardRecipient` in the
//! burn's hookData. Circle's `CctpForwarder` mints the USDC here; then anyone
//! (a relayer, the user, a keeper) calls [`Receiver::process`] with the same
//! message and attestation, at any time, and the contract:
//!
//! 1. runs every check from the `attested-receiver` checklist,
//! 2. records the nonce so the deposit can never be paid twice,
//! 3. pays `(amount - feeExecuted) * 10` to the attested recipient, either
//!    through the configured action contract or directly.
//!
//! If the action fails for any reason (including its `min_out` floor not
//! being met), its state changes are rolled back and the plain USDC goes to
//! the attested recipient instead. A deposit therefore never gets stuck in
//! this contract once it has been minted.
//!
//! **Status: unaudited.**

use attested_receiver::{attestation, delivered, message, Error};
use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, panic_with_error, symbol_short, token,
    vec, Address, Bytes, BytesN, Env, IntoVal, Symbol, Vec,
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
    /// Circle's MessageTransmitter, asked whether the nonce was minted.
    pub message_transmitter: Address,
    pub attesters: Vec<BytesN<20>>,
    pub threshold: u32,
    pub action: Option<Address>,
}

#[contracttype]
enum Key {
    Config,
}

/// Defined here rather than in `attested-receiver` because only a contract
/// that asks the MessageTransmitter can raise it.
#[soroban_sdk::contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ReceiverError {
    /// The attested message hasn't been minted yet (or never will be).
    NotMinted = 1,
}

const INSTANCE_TTL_THRESHOLD: u32 = 500_000;
const INSTANCE_TTL_EXTEND_TO: u32 = 3_000_000;

#[contract]
pub struct Receiver;

#[contractimpl]
impl Receiver {
    #[allow(clippy::too_many_arguments)]
    pub fn __constructor(
        env: Env,
        admin: Address,
        usdc: Address,
        forwarder: BytesN<32>,
        message_transmitter: Address,
        attesters: Vec<BytesN<20>>,
        threshold: u32,
        action: Option<Address>,
    ) {
        if let Err(e) = attestation::validate_config(&attesters, threshold) {
            panic_with_error!(&env, e);
        }
        let config = Config { admin, usdc, forwarder, message_transmitter, attesters, threshold, action };
        env.storage().instance().set(&Key::Config, &config);
    }

    /// Verify an attested CCTP message whose USDC was forwarded here, and
    /// deliver it. Permissionless: the attested hookData decides who is paid,
    /// so the caller can't change the outcome, and can only call it once per
    /// message.
    pub fn process(env: Env, message: Bytes, attestation: Bytes) -> Result<Outcome, Error> {
        let config = config(&env);
        let me = env.current_contract_address();

        // Checklist steps 1-4: authentic, for Stellar, sent to us, via the forwarder.
        attestation::verify(&env, &message, &attestation, &config.attesters, config.threshold)?;
        message::require_destination_domain(&message, STELLAR_DOMAIN)?;
        message::require_forward_to(&env, &message, &me)?;
        message::require_mint_recipient(&message, &config.forwarder)?;

        // Step 5: the mint happened, so the USDC is really here.
        let nonce = message::nonce(&message)?;
        let used: bool = env.invoke_contract(
            &config.message_transmitter,
            &Symbol::new(&env, "is_nonce_used"),
            vec![&env, nonce.clone().into_val(&env)],
        );
        if !used {
            panic_with_error!(&env, ReceiverError::NotMinted);
        }

        // Step 6: before any transfer.
        delivered::claim(&env, &nonce)?;

        // Step 7.
        let hook = message::attributed_hook(&env, &message)?;
        let amount = message::delivered_amount(&message)?;
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

    pub fn is_delivered(env: Env, nonce: BytesN<32>) -> bool {
        delivered::is_delivered(&env, &nonce)
    }

    pub fn config(env: Env) -> Config {
        config(&env)
    }

    /// Mirror a change to Circle's attester set.
    pub fn set_attesters(env: Env, attesters: Vec<BytesN<20>>, threshold: u32) -> Result<(), Error> {
        let mut c = admin_config(&env);
        attestation::validate_config(&attesters, threshold)?;
        c.attesters = attesters;
        c.threshold = threshold;
        env.storage().instance().set(&Key::Config, &c);
        Ok(())
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

fn config(env: &Env) -> Config {
    env.storage().instance().get(&Key::Config).unwrap()
}

fn admin_config(env: &Env) -> Config {
    let c = config(env);
    c.admin.require_auth();
    c
}
