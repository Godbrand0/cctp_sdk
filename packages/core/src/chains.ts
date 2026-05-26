import { UnsupportedChainError } from "./errors";

export type ChainConfig = {
  chainId: number;
  name: string;
  domain: number;               // Circle's CCTP domain ID
  rpcUrl?: string;              // optional default RPC
  tokenMessenger: `0x${string}`;
  messageTransmitter: `0x${string}`;
  usdc: `0x${string}`;
  usdcDecimals: number;         // 6 on most chains; 18 on Arc (native gas token)
  fastTransferSupported: boolean;
  blockExplorer: string;
};

// CCTP v2 uses a single shared deployment address across all EVM chains (except EDGE)
const CCTP_V2_TOKEN_MESSENGER = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" as const;
const CCTP_V2_MESSAGE_TRANSMITTER = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64" as const;

export const CHAINS: Record<string, ChainConfig> = {
  // Arc testnet only — mainnet not yet live
  arc: {
    chainId: 5042002,
    name: "Arc",
    domain: 26,
    rpcUrl: "https://rpc.testnet.arc.network",
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    usdc: "0x3600000000000000000000000000000000000000",
    usdcDecimals: 18, // Arc uses USDC as its native gas token with 18 decimals
    fastTransferSupported: true,
    blockExplorer: "https://testnet.arcscan.app",
  },
  ethereum: {
    chainId: 1,
    name: "Ethereum",
    domain: 0,
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MESSAGE_TRANSMITTER,
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://etherscan.io",
  },
  base: {
    chainId: 8453,
    name: "Base",
    domain: 6,
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MESSAGE_TRANSMITTER,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://basescan.org",
  },
  arbitrum: {
    chainId: 42161,
    name: "Arbitrum",
    domain: 3,
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MESSAGE_TRANSMITTER,
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://arbiscan.io",
  },
  optimism: {
    chainId: 10,
    name: "Optimism",
    domain: 2,
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MESSAGE_TRANSMITTER,
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://optimistic.etherscan.io",
  },
  polygon: {
    chainId: 137,
    name: "Polygon",
    domain: 7,
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MESSAGE_TRANSMITTER,
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://polygonscan.com",
  },
  avalanche: {
    chainId: 43114,
    name: "Avalanche",
    domain: 1,
    tokenMessenger: CCTP_V2_TOKEN_MESSENGER,
    messageTransmitter: CCTP_V2_MESSAGE_TRANSMITTER,
    usdc: "0xB97EF1544677A9573568Ff3696519E8D61e1fc62",
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://snowtrace.io",
  },
};

export type SupportedChain = keyof typeof CHAINS;

export function getChain(chainIdOrName: number | string): ChainConfig {
  const match = Object.values(CHAINS).find(
    c => c.chainId === chainIdOrName || c.name.toLowerCase() === String(chainIdOrName).toLowerCase()
  );
  if (!match) throw new UnsupportedChainError(chainIdOrName);
  return match;
}
