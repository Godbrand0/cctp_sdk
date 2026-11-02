use crate::Error;
use soroban_sdk::{Address, Bytes, BytesN, Env, String};

// CCTP V2 message: 148-byte header, then a BurnMessageV2 body.
// Header: version(4) sourceDomain(4) destinationDomain(4) nonce(32) sender(32)
// recipient(32) destinationCaller(32) minFinalityThreshold(4)
// finalityThresholdExecuted(4) = 148. Body before hookData: version(4)
// burnToken(32) mintRecipient(32) amount(32) messageSender(32) maxFee(32)
// feeExecuted(32) expirationBlock(32) = 228, so hookData starts at 376.
const DESTINATION_DOMAIN_OFFSET: u32 = 8;
const NONCE_OFFSET: u32 = 12;
const AMOUNT_OFFSET: u32 = 216;
const HOOK_DATA_OFFSET: u32 = 376;

// Within hookData: 24 reserved + 4 version + 4 length = 32 bytes before
// Circle's own forward-to strkey begins.
const CIRCLE_LEN_OFFSET: u32 = 28;
const CIRCLE_START: u32 = 32;
/// Stellar G/C strkeys are exactly 56 ASCII characters.
const STRKEY_LENGTH: u32 = 56;
const MIN_OUT_LENGTH: u32 = 16;

/// The attested trailing section of the hookData.
pub struct AttributedHook {
    pub recipient: Address,
    /// Minimum-output floor chosen by the sender; 0 means none.
    pub min_out: i128,
}

/// Smallest message that can hold a header, a burn body and the start of the
/// hookData. Call before any other reader.
pub fn check_length(message: &Bytes) -> Result<(), Error> {
    if message.len() < HOOK_DATA_OFFSET + CIRCLE_START {
        return Err(Error::MalformedMessage);
    }
    Ok(())
}

pub fn destination_domain(message: &Bytes) -> Result<u32, Error> {
    read_u32(&slice(message, DESTINATION_DOMAIN_OFFSET, 4)?)
}

/// Defence in depth: require the attested message to be addressed to
/// `expected` (Stellar is CCTP domain 27). A valid attestation for a message
/// bound for another chain is otherwise only rejected by the nonce check.
pub fn require_destination_domain(message: &Bytes, expected: u32) -> Result<(), Error> {
    if destination_domain(message)? != expected {
        return Err(Error::WrongDestination);
    }
    Ok(())
}

pub fn nonce(message: &Bytes) -> Result<BytesN<32>, Error> {
    slice(message, NONCE_OFFSET, 32)?
        .try_into()
        .map_err(|_| Error::MalformedMessage)
}

/// The burned USDC amount. Rejects anything that does not fit a positive i128
/// rather than truncating it.
pub fn amount(message: &Bytes) -> Result<i128, Error> {
    let amount = read_i128_32(&slice(message, AMOUNT_OFFSET, 32)?)?;
    if amount <= 0 {
        return Err(Error::MalformedMessage);
    }
    Ok(amount)
}

/// Read the `recipient + min_out` section that follows Circle's own
/// forward-to strkey in the hookData.
pub fn attributed_hook(env: &Env, message: &Bytes) -> Result<AttributedHook, Error> {
    check_length(message)?;
    let circle_len = read_u32(&slice(message, HOOK_DATA_OFFSET + CIRCLE_LEN_OFFSET, 4)?)?;
    if circle_len != STRKEY_LENGTH {
        return Err(Error::MalformedMessage);
    }
    let trailing = HOOK_DATA_OFFSET + CIRCLE_START + circle_len;
    let recipient_len = read_u32(&slice(message, trailing, 4)?)?;
    if recipient_len != STRKEY_LENGTH {
        return Err(Error::MalformedMessage);
    }
    let recipient_start = trailing + 4;
    let recipient_bytes = slice(message, recipient_start, recipient_len)?;
    let min_out = read_i128_16(&slice(message, recipient_start + recipient_len, MIN_OUT_LENGTH)?)?;

    let mut buf = [0u8; STRKEY_LENGTH as usize];
    recipient_bytes.copy_into_slice(&mut buf);
    let recipient = Address::from_string(&String::from_bytes(env, &buf));
    Ok(AttributedHook { recipient, min_out })
}

/// Bounds-checked slice: a short message is an error, never a host panic.
fn slice(message: &Bytes, start: u32, len: u32) -> Result<Bytes, Error> {
    let end = start.checked_add(len).ok_or(Error::MalformedMessage)?;
    if message.len() < end {
        return Err(Error::MalformedMessage);
    }
    Ok(message.slice(start..end))
}

fn read_u32(b: &Bytes) -> Result<u32, Error> {
    if b.len() != 4 {
        return Err(Error::MalformedMessage);
    }
    let mut out = [0u8; 4];
    b.copy_into_slice(&mut out);
    Ok(u32::from_be_bytes(out))
}

/// 32-byte big-endian field. Values above i128::MAX are rejected, not
/// truncated.
fn read_i128_32(b: &Bytes) -> Result<i128, Error> {
    if b.len() != 32 {
        return Err(Error::MalformedMessage);
    }
    let mut out = [0u8; 32];
    b.copy_into_slice(&mut out);
    if out[0..16].iter().any(|x| *x != 0) {
        return Err(Error::MalformedMessage);
    }
    let mut low = [0u8; 16];
    low.copy_from_slice(&out[16..32]);
    i128::try_from(u128::from_be_bytes(low)).map_err(|_| Error::MalformedMessage)
}

fn read_i128_16(b: &Bytes) -> Result<i128, Error> {
    if b.len() != 16 {
        return Err(Error::MalformedMessage);
    }
    let mut out = [0u8; 16];
    b.copy_into_slice(&mut out);
    i128::try_from(u128::from_be_bytes(out)).map_err(|_| Error::MalformedMessage)
}
