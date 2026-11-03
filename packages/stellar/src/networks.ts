/** Circle CCTP domain id for Stellar. */
export const STELLAR_CCTP_DOMAIN = 27;

export interface StellarCctpNetwork {
  domain: number;
  passphrase: string;
  /** Circle CctpForwarder: the mintRecipient/destinationCaller for inbound burns. */
  cctpForwarder: string;
  messageTransmitter?: string;
  tokenMessengerMinter?: string;
  /** USDC Stellar Asset Contract. */
  usdc?: string;
}

export const STELLAR_TESTNET: StellarCctpNetwork = {
  domain: STELLAR_CCTP_DOMAIN,
  passphrase: "Test SDF Network ; September 2015",
  // Verified on-chain in Conduit's DEPLOYMENTS.md #15.
  cctpForwarder: "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ",
  messageTransmitter: "CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY",
  tokenMessengerMinter: "CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP",
  usdc: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
};

export const STELLAR_MAINNET: StellarCctpNetwork = {
  domain: STELLAR_CCTP_DOMAIN,
  passphrase: "Public Global Stellar Network ; September 2015",
  // From Circle's Stellar contracts reference. NOT yet verified on-chain by
  // this project — confirm with a real view call before moving funds.
  cctpForwarder: "CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T",
};
