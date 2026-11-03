use attested_receiver::{attestation, message, Error};
use k256::ecdsa::{RecoveryId, Signature, SigningKey};
use sha3::{Digest, Keccak256};
use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env, Vec};

const STRKEY_LEN: usize = 56;

fn attester(seed: u8) -> (SigningKey, [u8; 20]) {
    let key = SigningKey::from_bytes(&[seed; 32].into()).unwrap();
    let public = key.verifying_key().to_encoded_point(false);
    let hash = Keccak256::digest(&public.as_bytes()[1..]);
    let mut address = [0u8; 20];
    address.copy_from_slice(&hash[12..32]);
    (key, address)
}

fn sign(key: &SigningKey, msg: &[u8], v_offset: u8) -> [u8; 65] {
    let digest = Keccak256::digest(msg);
    let (sig, rec): (Signature, RecoveryId) = key.sign_prehash_recoverable(&digest).unwrap();
    let mut out = [0u8; 65];
    out[..64].copy_from_slice(&sig.to_bytes());
    out[64] = rec.to_byte() + v_offset;
    out
}

/// Concatenate signatures from `keys`, sorted by recovered address.
fn attest(env: &Env, keys: &[(SigningKey, [u8; 20])], msg: &[u8]) -> Bytes {
    let mut signed: std::vec::Vec<([u8; 20], [u8; 65])> =
        keys.iter().map(|(k, a)| (*a, sign(k, msg, 27))).collect();
    signed.sort_by_key(|(a, _)| *a);
    let packed: std::vec::Vec<u8> = signed.into_iter().flat_map(|(_, s)| s).collect();
    Bytes::from_slice(env, &packed)
}

fn set(env: &Env, keys: &[(SigningKey, [u8; 20])]) -> Vec<BytesN<20>> {
    let mut v = Vec::new(env);
    for (_, a) in keys {
        v.push_back(BytesN::from_array(env, a));
    }
    v
}

fn strkey(_env: &Env, addr: &Address) -> [u8; STRKEY_LEN] {
    let mut buf = [0u8; STRKEY_LEN];
    addr.to_string().copy_into_slice(&mut buf);
    buf
}

struct Msg {
    bytes: std::vec::Vec<u8>,
}

/// A synthetic CCTP V2 burn message with the attributed hookData appended.
fn build(env: &Env, dest_domain: u32, nonce: u8, amount: u128, recipient: &Address, min_out: u128) -> Msg {
    let mut b = std::vec![0u8; 376];
    b[8..12].copy_from_slice(&dest_domain.to_be_bytes());
    b[12..44].fill(nonce);
    b[232..248].copy_from_slice(&amount.to_be_bytes());
    // hookData: 24 reserved + 4 version + 4 len + 56 forwardTo
    b.extend_from_slice(&[0u8; 28]);
    b.extend_from_slice(&(STRKEY_LEN as u32).to_be_bytes());
    b.extend_from_slice(&strkey(env, &Address::generate(env)));
    b.extend_from_slice(&(STRKEY_LEN as u32).to_be_bytes());
    b.extend_from_slice(&strkey(env, recipient));
    b.extend_from_slice(&min_out.to_be_bytes());
    Msg { bytes: b }
}

fn to_bytes(env: &Env, m: &[u8]) -> Bytes {
    Bytes::from_slice(env, m)
}

// ─── attestation ────────────────────────────────────────────────────────

#[test]
fn accepts_a_valid_threshold_attestation() {
    let env = Env::default();
    let keys = [attester(1), attester(2), attester(3)];
    let msg = b"hello cctp";
    let att = attest(&env, &keys[..2], msg);
    assert_eq!(attestation::verify(&env, &to_bytes(&env, msg), &att, &set(&env, &keys), 2), Ok(()));
}

#[test]
fn accepts_raw_recovery_id_form_of_v() {
    let env = Env::default();
    let keys = [attester(1)];
    let msg = b"hello";
    let sig = sign(&keys[0].0, msg, 0);
    let att = Bytes::from_slice(&env, &sig);
    assert_eq!(attestation::verify(&env, &to_bytes(&env, msg), &att, &set(&env, &keys), 1), Ok(()));
}

#[test]
fn rejects_a_tampered_message() {
    let env = Env::default();
    let keys = [attester(1)];
    let att = attest(&env, &keys, b"original");
    let r = attestation::verify(&env, &to_bytes(&env, b"tampered"), &att, &set(&env, &keys), 1);
    assert_eq!(r, Err(Error::InvalidAttestation));
}

#[test]
fn rejects_unknown_signer() {
    let env = Env::default();
    let signer = [attester(9)];
    let configured = [attester(1)];
    let att = attest(&env, &signer, b"m");
    let r = attestation::verify(&env, &to_bytes(&env, b"m"), &att, &set(&env, &configured), 1);
    assert_eq!(r, Err(Error::InvalidAttestation));
}

#[test]
fn rejects_duplicate_signatures() {
    let env = Env::default();
    let keys = [attester(1), attester(2)];
    let one = sign(&keys[0].0, b"m", 27);
    let mut packed = std::vec::Vec::new();
    packed.extend_from_slice(&one);
    packed.extend_from_slice(&one);
    let att = Bytes::from_slice(&env, &packed);
    let r = attestation::verify(&env, &to_bytes(&env, b"m"), &att, &set(&env, &keys), 2);
    assert_eq!(r, Err(Error::InvalidAttestation));
}

#[test]
fn rejects_unordered_signatures() {
    let env = Env::default();
    let keys = [attester(1), attester(2)];
    let mut signed: std::vec::Vec<([u8; 20], [u8; 65])> =
        keys.iter().map(|(k, a)| (*a, sign(k, b"m", 27))).collect();
    signed.sort_by_key(|(a, _)| core::cmp::Reverse(*a));
    let packed: std::vec::Vec<u8> = signed.into_iter().flat_map(|(_, s)| s).collect();
    let att = Bytes::from_slice(&env, &packed);
    let r = attestation::verify(&env, &to_bytes(&env, b"m"), &att, &set(&env, &keys), 2);
    assert_eq!(r, Err(Error::InvalidAttestation));
}

#[test]
fn rejects_wrong_attestation_length_and_empty() {
    let env = Env::default();
    let keys = [attester(1)];
    let att = attest(&env, &keys, b"m");
    let truncated = att.slice(0..64);
    assert_eq!(
        attestation::verify(&env, &to_bytes(&env, b"m"), &truncated, &set(&env, &keys), 1),
        Err(Error::InvalidAttestation)
    );
    assert_eq!(
        attestation::verify(&env, &to_bytes(&env, b"m"), &Bytes::new(&env), &set(&env, &keys), 1),
        Err(Error::InvalidAttestation)
    );
}

#[test]
fn rejects_invalid_config() {
    let env = Env::default();
    let keys = [attester(1)];
    assert_eq!(attestation::validate_config(&set(&env, &keys), 0), Err(Error::InvalidConfig));
    assert_eq!(attestation::validate_config(&set(&env, &keys), 2), Err(Error::InvalidConfig));
    assert_eq!(attestation::validate_config(&set(&env, &keys), 1), Ok(()));
    // verify itself refuses a zero threshold rather than accepting an empty attestation
    let r = attestation::verify(&env, &to_bytes(&env, b"m"), &Bytes::new(&env), &set(&env, &keys), 0);
    assert_eq!(r, Err(Error::InvalidConfig));
}

#[test]
fn rejects_bad_recovery_id() {
    let env = Env::default();
    let keys = [attester(1)];
    let mut sig = sign(&keys[0].0, b"m", 27);
    sig[64] = 31;
    let att = Bytes::from_slice(&env, &sig);
    assert_eq!(
        attestation::verify(&env, &to_bytes(&env, b"m"), &att, &set(&env, &keys), 1),
        Err(Error::InvalidAttestation)
    );
}

// ─── message parsing ────────────────────────────────────────────────────

#[test]
fn parses_fields() {
    let env = Env::default();
    let recipient = Address::generate(&env);
    let m = build(&env, 27, 0xab, 20_500_000, &recipient, 777);
    let bytes = to_bytes(&env, &m.bytes);
    assert_eq!(message::destination_domain(&bytes), Ok(27));
    assert_eq!(message::nonce(&bytes).unwrap(), BytesN::from_array(&env, &[0xab; 32]));
    assert_eq!(message::amount(&bytes), Ok(20_500_000));
    let hook = message::attributed_hook(&env, &bytes).unwrap();
    assert_eq!(hook.recipient, recipient);
    assert_eq!(hook.min_out, 777);
}

#[test]
fn destination_domain_check() {
    let env = Env::default();
    let r = Address::generate(&env);
    let bytes = to_bytes(&env, &build(&env, 6, 1, 1, &r, 0).bytes);
    assert_eq!(message::require_destination_domain(&bytes, 27), Err(Error::WrongDestination));
    let ok = to_bytes(&env, &build(&env, 27, 1, 1, &r, 0).bytes);
    assert_eq!(message::require_destination_domain(&ok, 27), Ok(()));
}

#[test]
fn rejects_zero_and_oversized_amounts() {
    let env = Env::default();
    let r = Address::generate(&env);
    let zero = to_bytes(&env, &build(&env, 27, 1, 0, &r, 0).bytes);
    assert_eq!(message::amount(&zero), Err(Error::MalformedMessage));
    // high bit of the i128 set -> would be negative if cast
    let neg = to_bytes(&env, &build(&env, 27, 1, 1u128 << 127, &r, 0).bytes);
    assert_eq!(message::amount(&neg), Err(Error::MalformedMessage));
    // anything in the upper 16 bytes cannot fit
    let mut big = build(&env, 27, 1, 1, &r, 0).bytes;
    big[216] = 1;
    assert_eq!(message::amount(&to_bytes(&env, &big)), Err(Error::MalformedMessage));
}

#[test]
fn rejects_truncated_and_misframed_messages() {
    let env = Env::default();
    let r = Address::generate(&env);
    let good = build(&env, 27, 1, 5, &r, 0).bytes;

    // every truncation must be an error, never a host panic
    for cut in [0usize, 10, 100, 375, 376, 400, good.len() - 1] {
        let bytes = to_bytes(&env, &good[..cut]);
        assert!(message::attributed_hook(&env, &bytes).is_err(), "cut {cut}");
    }

    // wrong declared recipient length
    let mut bad_len = good.clone();
    let recipient_len_at = 376 + 32 + STRKEY_LEN;
    bad_len[recipient_len_at + 3] = 57;
    assert_eq!(message::attributed_hook(&env, &to_bytes(&env, &bad_len)).err(), Some(Error::MalformedMessage));

    // wrong declared forward-to length
    let mut bad_fw = good.clone();
    bad_fw[376 + 28 + 3] = 10;
    assert_eq!(message::attributed_hook(&env, &to_bytes(&env, &bad_fw)).err(), Some(Error::MalformedMessage));
}

/// Produced by the `@cctp-sdk/stellar` TypeScript encoder
/// (encodeAttributedHookData with forwardTo = C(0x07 * 32),
/// recipient = G(0x05 * 32), minOut = 123456789). If either side changes the
/// wire format, this test fails.
#[test]
fn parses_hookdata_produced_by_the_typescript_encoder() {
    let env = Env::default();
    let hook = "0000000000000000000000000000000000000000000000000000000000000038434144514f425948413444514f425948413444514f425948413444514f425948413444514f425948413444514f4259484134445150354b5200000038474143514b424946415543514b424946415543514b424946415543514b424946415543514b424946415543514b424946415543514b47374e000000000000000000000000075bcd15";
    let mut msg = std::vec![0u8; 376];
    msg.extend((0..hook.len()).step_by(2).map(|i| u8::from_str_radix(&hook[i..i + 2], 16).unwrap()));
    let parsed = message::attributed_hook(&env, &to_bytes(&env, &msg)).unwrap();
    let mut buf = [0u8; STRKEY_LEN];
    parsed.recipient.to_string().copy_into_slice(&mut buf);
    assert_eq!(core::str::from_utf8(&buf).unwrap(), "GACQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKG7N");
    assert_eq!(parsed.min_out, 123456789);
}
