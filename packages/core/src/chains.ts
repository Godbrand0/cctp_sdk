import { UnsupportedChainError } from "./errors";

export type ChainConfig = {
  chainId: number;
  name: string;
  domain: number;               // Circle's CCTP domain ID
  rpcUrl?: string;              // optional default RPC
  tokenMessenger: `0x${string}`;
  messageTransmitter: `0x${string}`;
  usdc: `0x${string}`;
  fastTransferSupported: boolean;
  blockExplorer: string;
};

export const CHAINS: Record<string, ChainConfig> = {
  arc: {
    chainId: 1234,              // replace with actual Arc chain ID
    name: "Arc",
    domain: 9,                  // replace with actual Circle domain for Arc
    tokenMessenger: "0x0000000000000000000000000000000000000000",   // Arc TokenMessenger address placeholder
    messageTransmitter: "0x0000000000000000000000000000000000000000", // Arc MessageTransmitter address placeholder
    usdc: "0x0000000000000000000000000000000000000000",             // USDC on Arc placeholder
    fastTransferSupported: true,
    blockExplorer: "https://explorer.arc.io",
  },
  ethereum: {
    chainId: 1,
    name: "Ethereum",
    domain: 0,
    tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
    messageTransmitter: "0x0a992d191DEeC32aFe36203Ad87D7d289a738F81",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    fastTransferSupported: true,
    blockExplorer: "https://etherscan.io",
  },
  base: {
    chainId: 8453,
    name: "Base",
    domain: 6,
    tokenMessenger: "0x1682Ae6375C4E4A97e4B583BC394c861A46D8962",
    messageTransmitter: "0xAD09780d193884d503182aD4588450C416D6F9D4",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    fastTransferSupported: true,
    blockExplorer: "https://basescan.org",
  },
  arbitrum: {
    chainId: 42161,
    name: "Arbitrum",
    domain: 3,
    tokenMessenger: "0x19330d10D9Cc8751218eaf51E8885D058642E08A",
    messageTransmitter: "0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    fastTransferSupported: true,
    blockExplorer: "https://arbiscan.io",
  },
  optimism: {
    chainId: 10,
    name: "Optimism",
    domain: 2,
    tokenMessenger: "0x2B4069517957735bE00ceE0fadAE88a26365528f",
    messageTransmitter: "0x4D41f22c5a0e5c74090899E5a8Fb597a8842b3e8",
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    fastTransferSupported: true,
    blockExplorer: "https://optimistic.etherscan.io",
  },
  polygon: {
    chainId: 137,
    name: "Polygon",
    domain: 7,
    tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
    messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    fastTransferSupported: true,
    blockExplorer: "https://polygonscan.com",
  },
  avalanche: {
    chainId: 43114,
    name: "Avalanche",
    domain: 1,
    tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
    messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
    usdc: "0xB97EF1544677A9573568Ff3696519E8D61e1fc62",
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
