import { StrKey } from "@stellar/stellar-sdk";
import { ascii, concat, fromAscii, hexToBytes, bytesToHex, readUintBE, u32be, uintBE } from "./bytes.js";

const RESERVED_LEN = 24;
const VERSION_LEN = 4;
const LEN_PREFIX = 4;
const MIN_OUT_LEN = 16;
const HEADER_LEN = RESERVED_LEN + VERSION_LEN;

function assertStellarDestination(addr: string, what: string): void {
  if (!StrKey.isValidEd25519PublicKey(addr) && !StrKey.isValidContract(addr)) {
    throw new Error(`${what} must be a G... account or C... contract strkey`);
  }
}

export interface AttributedHookData {
  /** The contract/account Circle's CctpForwarder forwards the minted USDC to. */
  forwardTo: string;
  /** The real final recipient, bound inside Circle's attestation. */
  recipient: string;
  /** Minimum output floor in the destination asset's smallest unit. 0n = none. */
  minOut: bigint;
}

/**
 * Encode the hookData a source-chain burn must carry to deliver USDC through
 * Circle's Stellar CctpForwarder with an attested recipient.
 *
 * Layout:
 *   24B reserved (0) | 4B version (0) | 4B BE length | ascii forwardTo strkey
 *   -- Circle's own mint_and_forward format ends here; it ignores what follows --
 *   4B BE length | ascii recipient strkey | 16B BE minOut
 *
 * The trailing section is a convention proven on-chain in Conduit, not part of
 * Circle's spec. A consumer contract re-parses the attested message to read it.
 */
export function encodeAttributedHookData(input: AttributedHookData): Uint8Array {
  assertStellarDestination(input.forwardTo, "forwardTo");
  assertStellarDestination(input.recipient, "recipient");
  const forwardTo = ascii(input.forwardTo);
  const recipient = ascii(input.recipient);
  return concat(
    new Uint8Array(HEADER_LEN),
    u32be(forwardTo.length),
    forwardTo,
    u32be(recipient.length),
    recipient,
    uintBE(input.minOut, MIN_OUT_LEN),
  );
}

export function parseAttributedHookData(data: Uint8Array | string): AttributedHookData {
  const b = typeof data === "string" ? hexToBytes(data) : data;
  let off = HEADER_LEN;
  const readSection = (): string => {
    if (b.length < off + LEN_PREFIX) throw new Error("hookData truncated");
    const len = Number(readUintBE(b.subarray(off, off + LEN_PREFIX)));
    off += LEN_PREFIX;
    if (b.length < off + len) throw new Error("hookData truncated");
    const s = fromAscii(b.subarray(off, off + len));
    off += len;
    return s;
  };
  if (b.length < HEADER_LEN) throw new Error("hookData truncated");
  if (b.subarray(0, HEADER_LEN).some((x) => x !== 0)) throw new Error("unsupported hookData version");
  const forwardTo = readSection();
  const recipient = readSection();
  if (b.length < off + MIN_OUT_LEN) throw new Error("hookData truncated");
  const minOut = readUintBE(b.subarray(off, off + MIN_OUT_LEN));
  assertStellarDestination(forwardTo, "forwardTo");
  assertStellarDestination(recipient, "recipient");
  return { forwardTo, recipient, minOut };
}

export const encodeAttributedHookDataHex = (i: AttributedHookData) => bytesToHex(encodeAttributedHookData(i));
