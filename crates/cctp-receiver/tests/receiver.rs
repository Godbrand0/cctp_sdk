use attested_receiver::Error;
use cctp_receiver::{Outcome, Receiver, ReceiverClient};
use k256::ecdsa::{RecoveryId, Signature, SigningKey};
use sha3::{Digest, Keccak256};
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    token::{StellarAssetClient, TokenClient},
    Address, Bytes, BytesN, Env, Vec,
};

const STRKEY_LEN: usize = 56;
const FORWARDER: [u8; 32] = [0x07; 32];

// ─── mocks ──────────────────────────────────────────────────────────────

mod mt {
    use soroban_sdk::{contract, contractimpl, BytesN, Env};
    #[contract]
    pub struct MockTransmitter;
    #[contractimpl]
    impl MockTransmitter {
        pub fn mark(env: Env, nonce: BytesN<32>) {
            env.storage().instance().set(&nonce, &true);
        }
        pub fn is_nonce_used(env: Env, nonce: BytesN<32>) -> bool {
            env.storage().instance().has(&nonce)
        }
    }
}

/// Pulls the full amount and forwards it to the recipient; enforces min_out.
mod good {
    use soroban_sdk::{contract, contractimpl, token::TokenClient, Address, Env, Symbol};
    #[contract]
    pub struct GoodAction;
    #[contractimpl]
    impl GoodAction {
        pub fn __constructor(env: Env, usdc: Address) {
            env.storage().instance().set(&Symbol::new(&env, "usdc"), &usdc);
        }
        pub fn execute(env: Env, from: Address, recipient: Address, amount: i128, min_out: i128) {
            if amount < min_out {
                panic!("below min_out");
            }
            let usdc: Address = env.storage().instance().get(&Symbol::new(&env, "usdc")).unwrap();
            let me = env.current_contract_address();
            TokenClient::new(&env, &usdc).transfer_from(&me, &from, &recipient, &amount);
        }
    }
}

/// Pulls the USDC, then fails: the pull must be rolled back.
mod failing {
    use soroban_sdk::{contract, contractimpl, token::TokenClient, Address, Env, Symbol};
    #[contract]
    pub struct FailingAction;
    #[contractimpl]
    impl FailingAction {
        pub fn __constructor(env: Env, usdc: Address) {
            env.storage().instance().set(&Symbol::new(&env, "usdc"), &usdc);
        }
        pub fn execute(env: Env, from: Address, _recipient: Address, amount: i128, _min_out: i128) {
            let usdc: Address = env.storage().instance().get(&Symbol::new(&env, "usdc")).unwrap();
            let me = env.current_contract_address();
            TokenClient::new(&env, &usdc).transfer_from(&me, &from, &me, &amount);
            panic!("swap failed");
        }
    }
}

/// Succeeds but only pulls half.
mod partial {
    use soroban_sdk::{contract, contractimpl, token::TokenClient, Address, Env, Symbol};
    #[contract]
    pub struct PartialAction;
    #[contractimpl]
    impl PartialAction {
        pub fn __constructor(env: Env, usdc: Address) {
            env.storage().instance().set(&Symbol::new(&env, "usdc"), &usdc);
        }
        pub fn execute(env: Env, from: Address, recipient: Address, amount: i128, _min_out: i128) {
            let usdc: Address = env.storage().instance().get(&Symbol::new(&env, "usdc")).unwrap();
            let me = env.current_contract_address();
            TokenClient::new(&env, &usdc).transfer_from(&me, &from, &recipient, &(amount / 2));
        }
    }
}

// ─── fixtures ───────────────────────────────────────────────────────────

fn attester(seed: u8) -> (SigningKey, [u8; 20]) {
    let key = SigningKey::from_bytes(&[seed; 32].into()).unwrap();
    let public = key.verifying_key().to_encoded_point(false);
    let hash = Keccak256::digest(&public.as_bytes()[1..]);
    let mut address = [0u8; 20];
    address.copy_from_slice(&hash[12..32]);
    (key, address)
}

fn attest(env: &Env, keys: &[(SigningKey, [u8; 20])], msg: &[u8]) -> Bytes {
    let digest = Keccak256::digest(msg);
    let mut signed: std::vec::Vec<([u8; 20], [u8; 65])> = keys
        .iter()
        .map(|(k, a)| {
            let (sig, rec): (Signature, RecoveryId) = k.sign_prehash_recoverable(&digest).unwrap();
            let mut out = [0u8; 65];
            out[..64].copy_from_slice(&sig.to_bytes());
            out[64] = rec.to_byte() + 27;
            (*a, out)
        })
        .collect();
    signed.sort_by_key(|(a, _)| *a);
    let packed: std::vec::Vec<u8> = signed.into_iter().flat_map(|(_, s)| s).collect();
    Bytes::from_slice(env, &packed)
}

fn strkey(addr: &Address) -> [u8; STRKEY_LEN] {
    let mut buf = [0u8; STRKEY_LEN];
    addr.to_string().copy_into_slice(&mut buf);
    buf
}

struct Burn<'a> {
    nonce: u8,
    amount: u128,
    fee: u128,
    forward_to: &'a Address,
    recipient: &'a Address,
    min_out: u128,
}

fn message(b: &Burn) -> std::vec::Vec<u8> {
    let mut m = std::vec![0u8; 376];
    m[8..12].copy_from_slice(&27u32.to_be_bytes());
    m[12..44].fill(b.nonce);
    m[184..216].copy_from_slice(&FORWARDER);
    m[232..248].copy_from_slice(&b.amount.to_be_bytes());
    m[328..344].copy_from_slice(&b.fee.to_be_bytes());
    m.extend_from_slice(&[0u8; 28]);
    m.extend_from_slice(&(STRKEY_LEN as u32).to_be_bytes());
    m.extend_from_slice(&strkey(b.forward_to));
    m.extend_from_slice(&(STRKEY_LEN as u32).to_be_bytes());
    m.extend_from_slice(&strkey(b.recipient));
    m.extend_from_slice(&b.min_out.to_be_bytes());
    m
}

struct Setup<'a> {
    env: Env,
    keys: [(SigningKey, [u8; 20]); 2],
    receiver: ReceiverClient<'a>,
    usdc: TokenClient<'a>,
    usdc_admin: StellarAssetClient<'a>,
    mt: mt::MockTransmitterClient<'a>,
    recipient: Address,
}

fn setup(action: Option<fn(&Env, &Address) -> Address>) -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();
    let keys = [attester(1), attester(2)];
    let mut attesters = Vec::new(&env);
    for (_, a) in &keys {
        attesters.push_back(BytesN::from_array(&env, a));
    }
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let usdc_addr = sac.address();
    let mt_addr = env.register(mt::MockTransmitter, ());
    let action = action.map(|f| f(&env, &usdc_addr));
    let receiver_addr = env.register(
        Receiver,
        (
            Address::generate(&env),
            usdc_addr.clone(),
            BytesN::from_array(&env, &FORWARDER),
            mt_addr.clone(),
            attesters,
            2u32,
            action,
        ),
    );
    Setup {
        receiver: ReceiverClient::new(&env, &receiver_addr),
        usdc: TokenClient::new(&env, &usdc_addr),
        usdc_admin: StellarAssetClient::new(&env, &usdc_addr),
        mt: mt::MockTransmitterClient::new(&env, &mt_addr),
        recipient: Address::generate(&env),
        keys,
        env,
    }
}

impl Setup<'_> {
    /// What CctpForwarder.mint_and_forward does: mint the net amount here and
    /// mark the nonce used.
    fn mint(&self, b: &Burn) {
        self.usdc_admin.mint(&self.receiver.address, &(((b.amount - b.fee) * 10) as i128));
        self.mt.mark(&BytesN::from_array(&self.env, &[b.nonce; 32]));
    }
    fn signed(&self, b: &Burn) -> (Bytes, Bytes) {
        let m = message(b);
        (Bytes::from_slice(&self.env, &m), attest(&self.env, &self.keys, &m))
    }
    fn burn<'a>(&'a self, nonce: u8, amount: u128, fee: u128, min_out: u128) -> Burn<'a> {
        Burn { nonce, amount, fee, forward_to: &self.receiver.address, recipient: &self.recipient, min_out }
    }
}

/// The contract error a `try_*` call failed with.
fn err_of<T: core::fmt::Debug>(r: Result<T, Result<Error, soroban_sdk::InvokeError>>) -> Error {
    match r {
        Err(Ok(e)) => e,
        other => panic!("expected a contract error, got {other:?}"),
    }
}

// ─── tests ──────────────────────────────────────────────────────────────

#[test]
fn delivers_net_amount_in_7_decimals_to_the_attested_recipient() {
    let s = setup(None);
    let b = s.burn(1, 1_000_000, 130, 0); // 1 USDC, 0.000130 fee
    s.mint(&b);
    let (m, a) = s.signed(&b);
    assert_eq!(s.receiver.process(&m, &a), Outcome::Delivered);
    assert!(!s.env.events().all().is_empty());
    assert_eq!(s.usdc.balance(&s.recipient), 9_998_700);
    assert_eq!(s.usdc.balance(&s.receiver.address), 0);
    assert!(s.receiver.is_delivered(&BytesN::from_array(&s.env, &[1; 32])));
}

#[test]
fn cannot_be_processed_twice() {
    let s = setup(None);
    let b = s.burn(1, 1_000_000, 0, 0);
    s.mint(&b);
    // another deposit's funds sit in the pool too
    s.usdc_admin.mint(&s.receiver.address, &50_000_000);
    let (m, a) = s.signed(&b);
    s.receiver.process(&m, &a);
    assert_eq!(err_of(s.receiver.try_process(&m, &a)), Error::AlreadyDelivered);
    assert_eq!(s.usdc.balance(&s.recipient), 10_000_000);
}

#[test]
fn waits_for_the_mint() {
    let s = setup(None);
    let b = s.burn(1, 1_000_000, 0, 0);
    let (m, a) = s.signed(&b);
    // not minted yet: rejected, and the nonce is NOT consumed
    assert!(s.receiver.try_process(&m, &a).is_err());
    assert!(!s.receiver.is_delivered(&BytesN::from_array(&s.env, &[1; 32])));
    // processing later, by anyone, completes it
    s.mint(&b);
    assert_eq!(s.receiver.process(&m, &a), Outcome::Delivered);
    assert_eq!(s.usdc.balance(&s.recipient), 10_000_000);
}

#[test]
fn rejects_a_message_forwarded_elsewhere() {
    let s = setup(None);
    s.usdc_admin.mint(&s.receiver.address, &50_000_000);
    let elsewhere = Address::generate(&s.env);
    let b = Burn { forward_to: &elsewhere, ..s.burn(1, 1_000_000, 0, 0) };
    s.mt.mark(&BytesN::from_array(&s.env, &[1; 32]));
    let (m, a) = s.signed(&b);
    assert_eq!(err_of(s.receiver.try_process(&m, &a)), Error::WrongForwardTo);
    assert_eq!(s.usdc.balance(&s.recipient), 0);
}

#[test]
fn rejects_a_forged_attestation() {
    let s = setup(None);
    let b = s.burn(1, 1_000_000, 0, 0);
    s.mint(&b);
    let m = Bytes::from_slice(&s.env, &message(&b));
    let forged = attest(&s.env, &[attester(8), attester(9)], &message(&b));
    assert_eq!(err_of(s.receiver.try_process(&m, &forged)), Error::InvalidAttestation);
}

fn good_action(env: &Env, usdc: &Address) -> Address {
    env.register(good::GoodAction, (usdc.clone(),))
}
fn failing_action(env: &Env, usdc: &Address) -> Address {
    env.register(failing::FailingAction, (usdc.clone(),))
}
fn partial_action(env: &Env, usdc: &Address) -> Address {
    env.register(partial::PartialAction, (usdc.clone(),))
}

#[test]
fn runs_the_action() {
    let s = setup(Some(good_action));
    let b = s.burn(1, 1_000_000, 0, 5_000_000);
    s.mint(&b);
    let (m, a) = s.signed(&b);
    assert_eq!(s.receiver.process(&m, &a), Outcome::Executed);
    assert_eq!(s.usdc.balance(&s.recipient), 10_000_000);
    let action = s.receiver.config().action.unwrap();
    assert_eq!(s.usdc.allowance(&s.receiver.address, &action), 0);
}

#[test]
fn falls_back_to_plain_usdc_when_min_out_is_not_met() {
    let s = setup(Some(good_action));
    let b = s.burn(1, 1_000_000, 0, 20_000_000); // floor above what arrived
    s.mint(&b);
    let (m, a) = s.signed(&b);
    assert_eq!(s.receiver.process(&m, &a), Outcome::Fallback);
    assert_eq!(s.usdc.balance(&s.recipient), 10_000_000);
    assert_eq!(s.usdc.balance(&s.receiver.address), 0);
}

#[test]
fn rolls_back_a_failing_action_and_falls_back() {
    let s = setup(Some(failing_action));
    let b = s.burn(1, 1_000_000, 0, 0);
    s.mint(&b);
    let (m, a) = s.signed(&b);
    assert_eq!(s.receiver.process(&m, &a), Outcome::Fallback);
    let action = s.receiver.config().action.unwrap();
    assert_eq!(s.usdc.balance(&action), 0);
    assert_eq!(s.usdc.balance(&s.recipient), 10_000_000);
    assert_eq!(s.usdc.allowance(&s.receiver.address, &action), 0);
}

#[test]
fn sends_unpulled_remainder_to_the_recipient() {
    let s = setup(Some(partial_action));
    let b = s.burn(1, 1_000_000, 0, 0);
    s.mint(&b);
    s.usdc_admin.mint(&s.receiver.address, &50_000_000); // other deposits
    let (m, a) = s.signed(&b);
    assert_eq!(s.receiver.process(&m, &a), Outcome::Fallback);
    assert_eq!(s.usdc.balance(&s.recipient), 10_000_000);
    assert_eq!(s.usdc.balance(&s.receiver.address), 50_000_000);
}

#[test]
fn admin_rejects_an_invalid_attester_config() {
    let s = setup(None);
    let empty = Vec::new(&s.env);
    assert_eq!(err_of(s.receiver.try_set_attesters(&empty, &1)), Error::InvalidConfig);
}
