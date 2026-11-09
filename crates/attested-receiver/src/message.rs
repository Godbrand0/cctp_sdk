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
const MINT_RECIPIENT_OFFSET: u32 = 184;
const AMOUNT_OFFSET: u32 = 216;
const FEE_EXECUTED_OFFSET: u32 = 312;
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

/// The burned USDC amount in the message's 6-decimal units, before the
/// fee. Use [`delivered_amount`] for what actually arrived. Rejects anything that does not fit a positive i128
/// rather than truncating it.
pub fn amount(message: &Bytes) -> Result<i128, Error> {
    let amount = read_i128_32(&slice(message, AMOUNT_OFFSET, 32)?)?;
    if amount <= 0 {
        return Err(Error::MalformedMessage);
    }
    Ok(amount)
}

/// The fee Circle took on the source side, in the message's 6-decimal units.
/// The mint delivers `amount - fee_executed`, not `amount`.
pub fn fee_executed(message: &Bytes) -> Result<i128, Error> {
    let fee = read_i128_32(&slice(message, FEE_EXECUTED_OFFSET, 32)?)?;
    if fee < 0 {
        return Err(Error::MalformedMessage);
    }
    Ok(fee)
}

/// Stellar USDC has 7 decimals; CCTP messages carry 6. Circle's Stellar mint
/// scales the message amount by this factor.
pub const STELLAR_USDC_SCALE: i128 = 10;

/// The USDC that actually reached the forward-to address, in Stellar's
/// 7-decimal units: `(amount - fee_executed) * 10`. Pay out this, never
/// [`amount`], or every deposit overpays from pooled funds.
pub fn delivered_amount(message: &Bytes) -> Result<i128, Error> {
    let net = amount(message)?
        .checked_sub(fee_executed(message)?)
        .ok_or(Error::MalformedMessage)?;
    if net <= 0 {
        return Err(Error::MalformedMessage);
    }
    net.checked_mul(STELLAR_USDC_SCALE).ok_or(Error::MalformedMessage)
}

/// The body's mintRecipient. For a Stellar-bound message Circle requires this
/// to be the CctpForwarder contract's 32-byte id.
pub fn mint_recipient(message: &Bytes) -> Result<BytesN<32>, Error> {
    slice(message, MINT_RECIPIENT_OFFSET, 32)?
        .try_into()
        .map_err(|_| Error::MalformedMessage)
}

/// Defence in depth: require the message to have been minted through
/// `forwarder` (its 32-byte contract id).
pub fn require_mint_recipient(message: &Bytes, forwarder: &BytesN<32>) -> Result<(), Error> {
    if mint_recipient(message)? != *forwarder {
        return Err(Error::WrongMintRecipient);
    }
    Ok(())
}

/// The address Circle's CctpForwarder sent the minted USDC to (Circle's own
/// section of the hookData).
pub fn forward_to(env: &Env, message: &Bytes) -> Result<Address, Error> {
    check_length(message)?;
    let circle_len = read_u32(&slice(message, HOOK_DATA_OFFSET + CIRCLE_LEN_OFFSET, 4)?)?;
    if circle_len != STRKEY_LENGTH {
        return Err(Error::MalformedMessage);
    }
    read_strkey(env, &slice(message, HOOK_DATA_OFFSET + CIRCLE_START, circle_len)?)
}

/// Require the minted USDC to have been forwarded to `expected`, normally
/// `env.current_contract_address()`. Without this check, a valid attested
/// message whose USDC went somewhere else would pass every other check, and a
/// consumer would pay it out of funds that belong to other deposits.
pub fn require_forward_to(env: &Env, message: &Bytes, expected: &Address) -> Result<(), Error> {
    if forward_to(env, message)? != *expected {
        return Err(Error::WrongForwardTo);
    }
    Ok(())
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

    let recipient = read_strkey(env, &recipient_bytes)?;
    Ok(AttributedHook { recipient, min_out })
}

fn read_strkey(env: &Env, b: &Bytes) -> Result<Address, Error> {
    if b.len() != STRKEY_LENGTH {
        return Err(Error::MalformedMessage);
    }
    let mut buf = [0u8; STRKEY_LENGTH as usize];
    b.copy_into_slice(&mut buf);
    // Address::from_string traps on a bad strkey, and a trap can't be
    // handled, so a typo in the hookData would make the message impossible
    // to process *or* recover. Validate first and return an error instead.
    validate_strkey(&buf)?;
    Ok(Address::from_string(&String::from_bytes(env, &buf)))
}

/// Strkey version bytes for account (G...) and contract (C...) addresses.
const VERSION_ACCOUNT: u8 = 6 << 3;
const VERSION_CONTRACT: u8 = 2 << 3;

/// Check a 56-character strkey: base32 alphabet, a G or C version byte and
/// the CRC16-XModem checksum.
fn validate_strkey(s: &[u8; STRKEY_LENGTH as usize]) -> Result<(), Error> {
    // 56 chars * 5 bits = 35 bytes: version(1) + payload(32) + checksum(2).
    let mut raw = [0u8; 35];
    let (mut acc, mut bits, mut n) = (0u32, 0u32, 0usize);
    for &c in s.iter() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'2'..=b'7' => c - b'2' + 26,
            _ => return Err(Error::MalformedMessage),
        } as u32;
        acc = (acc << 5) | v;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            raw[n] = (acc >> bits) as u8;
            n += 1;
        }
    }
    if raw[0] != VERSION_ACCOUNT && raw[0] != VERSION_CONTRACT {
        return Err(Error::MalformedMessage);
    }
    let expected = u16::from_le_bytes([raw[33], raw[34]]);
    if crc16_xmodem(&raw[..33]) != expected {
        return Err(Error::MalformedMessage);
    }
    Ok(())
}

fn crc16_xmodem(data: &[u8]) -> u16 {
    let mut crc: u16 = 0;
    for &b in data {
        crc ^= (b as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 { (crc << 1) ^ 0x1021 } else { crc << 1 };
        }
    }
    crc
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
