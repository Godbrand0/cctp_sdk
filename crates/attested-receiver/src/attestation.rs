use crate::Error;
use soroban_sdk::{crypto::Hash, Bytes, BytesN, Env, Vec};

/// Each attestation signature is r(32) + s(32) + v(1), the layout Circle's
/// EVM MessageTransmitter consumes.
pub const SIGNATURE_LENGTH: u32 = 65;

/// Reject configurations that could never work or would accept anything:
/// a zero threshold accepts an empty attestation, and a threshold above the
/// attester count can never be met.
pub fn validate_config(attesters: &Vec<BytesN<20>>, threshold: u32) -> Result<(), Error> {
    if threshold == 0 || threshold > attesters.len() {
        return Err(Error::InvalidConfig);
    }
    Ok(())
}

/// Threshold ECDSA verification over keccak256(`message`): recover each
/// signature to an Ethereum-style address, require every recovered address to
/// be in `attesters`, and require the addresses to be strictly increasing so
/// one attester cannot be counted twice.
///
/// This authenticates the *bytes*. It does not prove the transfer minted;
/// consumers must also check the nonce against Circle's MessageTransmitter.
pub fn verify(
    env: &Env,
    message: &Bytes,
    attestation: &Bytes,
    attesters: &Vec<BytesN<20>>,
    threshold: u32,
) -> Result<(), Error> {
    validate_config(attesters, threshold)?;
    verify_with(env, message, attestation, threshold, |a| attesters.contains(a))
}

/// [`verify`] against an attester set you look up rather than store, e.g.
/// `is_enabled_attester` on Circle's own Stellar MessageTransmitter, so the
/// set follows Circle's rotations and no admin can swap in its own key.
pub fn verify_with(
    env: &Env,
    message: &Bytes,
    attestation: &Bytes,
    threshold: u32,
    is_attester: impl Fn(&BytesN<20>) -> bool,
) -> Result<(), Error> {
    if threshold == 0 {
        return Err(Error::InvalidConfig);
    }
    if attestation.len() != threshold * SIGNATURE_LENGTH {
        return Err(Error::InvalidAttestation);
    }

    let digest = env.crypto().keccak256(message);
    let mut previous: Option<BytesN<20>> = None;
    for i in 0..threshold {
        let start = i * SIGNATURE_LENGTH;
        let signature = attestation.slice(start..start + SIGNATURE_LENGTH);
        let recovered = recover_evm_address(env, &digest, &signature)?;

        if let Some(prev) = previous {
            if recovered <= prev {
                return Err(Error::InvalidAttestation);
            }
        }
        if !is_attester(&recovered) {
            return Err(Error::InvalidAttestation);
        }
        previous = Some(recovered);
    }
    Ok(())
}

/// Recover the Ethereum-style address that produced `signature` over
/// `digest`. `v` is accepted as a raw recovery id (0/1) or as 27/28.
fn recover_evm_address(env: &Env, digest: &Hash<32>, signature: &Bytes) -> Result<BytesN<20>, Error> {
    let rs: BytesN<64> = signature
        .slice(0..64)
        .try_into()
        .map_err(|_| Error::InvalidAttestation)?;
    let v = signature.get(64).ok_or(Error::InvalidAttestation)?;
    let recovery_id: u32 = if v >= 27 { (v - 27) as u32 } else { v as u32 };
    if recovery_id > 1 {
        return Err(Error::InvalidAttestation);
    }

    // 65 bytes: 0x04 prefix + 64-byte public key. The address is the low 20
    // bytes of keccak256(key without prefix).
    let public_key = env.crypto().secp256k1_recover(digest, &rs, recovery_id).to_array();
    let key_body = Bytes::from_slice(env, &public_key[1..]);
    let hashed = env.crypto().keccak256(&key_body).to_bytes().to_array();
    let mut address = [0u8; 20];
    address.copy_from_slice(&hashed[12..32]);
    Ok(BytesN::from_array(env, &address))
}
