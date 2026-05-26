import { UnsupportedChainError } from "./errors";

export type Env = "mainnet" | "testnet";

export type ChainConfig = {
  chainId: number;
  name: string;
  domain: number;
  rpcUrl?: string;
  tokenMessenger: `0x${string}`;
  messageTransmitter: `0x${string}`;
  usdc: `0x${string}`;
  usdcDecimals: number;
  fastTransferSupported: boolean;
  blockExplorer: string;
};

// ── Shared CCTP v2 deployment addresses ──────────────────────────────────────

const MAINNET_TOKEN_MESSENGER  = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" as const;
const MAINNET_MSG_TRANSMITTER  = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64" as const;
const TESTNET_TOKEN_MESSENGER  = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as const;
const TESTNET_MSG_TRANSMITTER  = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;

// ── Mainnet chains ────────────────────────────────────────────────────────────

export const MAINNET_CHAINS = {
  ethereum: {
    chainId: 1,
    name: "Ethereum",
    domain: 0,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MSG_TRANSMITTER,
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://etherscan.io",
  },
  avalanche: {
    chainId: 43114,
    name: "Avalanche",
    domain: 1,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MSG_TRANSMITTER,
    usdc: "0xB97EF1544677A9573568Ff3696519E8D61e1fc62" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://snowtrace.io",
  },
  optimism: {
    chainId: 10,
    name: "Optimism",
    domain: 2,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MSG_TRANSMITTER,
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://optimistic.etherscan.io",
  },
  arbitrum: {
    chainId: 42161,
    name: "Arbitrum",
    domain: 3,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MSG_TRANSMITTER,
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://arbiscan.io",
  },
  base: {
    chainId: 8453,
    name: "Base",
    domain: 6,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MSG_TRANSMITTER,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://basescan.org",
  },
  polygon: {
    chainId: 137,
    name: "Polygon",
    domain: 7,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MSG_TRANSMITTER,
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://polygonscan.com",
  },
  unichain: {
    chainId: 130,
    name: "Unichain",
    domain: 10,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MSG_TRANSMITTER,
    usdc: "0x078D782b760474a361dDA0AF3839290B0EF57AD6" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://uniscan.xyz",
  },
  linea: {
    chainId: 59144,
    name: "Linea",
    domain: 11,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MSG_TRANSMITTER,
    usdc: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://lineascan.build",
  },
  sonic: {
    chainId: 146,
    name: "Sonic",
    domain: 13,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MSG_TRANSMITTER,
    usdc: "0x29219dd400f2Bf60E5a23d13Be72B486D4038894" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://sonicscan.org",
  },
  worldchain: {
    chainId: 480,
    name: "World Chain",
    domain: 14,
    tokenMessenger: MAINNET_TOKEN_MESSENGER,
    messageTransmitter: MAINNET_MSG_TRANSMITTER,
    usdc: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://worldscan.org",
  },
} as const satisfies Record<string, ChainConfig>;

// ── Testnet chains ────────────────────────────────────────────────────────────

export const TESTNET_CHAINS = {
  ethereum: {
    chainId: 11155111,
    name: "Ethereum Sepolia",
    domain: 0,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MSG_TRANSMITTER,
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://sepolia.etherscan.io",
  },
  avalanche: {
    chainId: 43113,
    name: "Avalanche Fuji",
    domain: 1,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MSG_TRANSMITTER,
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://testnet.snowtrace.io",
  },
  optimism: {
    chainId: 11155420,
    name: "OP Sepolia",
    domain: 2,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MSG_TRANSMITTER,
    usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://sepolia-optimism.etherscan.io",
  },
  arbitrum: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    domain: 3,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MSG_TRANSMITTER,
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://sepolia.arbiscan.io",
  },
  base: {
    chainId: 84532,
    name: "Base Sepolia",
    domain: 6,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MSG_TRANSMITTER,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://sepolia.basescan.org",
  },
  polygon: {
    chainId: 80002,
    name: "Polygon Amoy",
    domain: 7,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MSG_TRANSMITTER,
    usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://amoy.polygonscan.com",
  },
  unichain: {
    chainId: 1301,
    name: "Unichain Sepolia",
    domain: 10,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MSG_TRANSMITTER,
    usdc: "0x31d0220469e10c4E71834a79b1f276d740d3768F" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://sepolia.uniscan.xyz",
  },
  linea: {
    chainId: 59141,
    name: "Linea Sepolia",
    domain: 11,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MSG_TRANSMITTER,
    usdc: "0xFEce4462D57bD51A6A552365A011b95f0E16d9B7" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://sepolia.lineascan.build",
  },
  sonic: {
    chainId: 57054,
    name: "Sonic Testnet",
    domain: 13,
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MSG_TRANSMITTER,
    usdc: "0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://testnet.sonicscan.org",
  },
  worldchain: {
    chainId: 4801,
    name: "World Chain Sepolia",
    domain: 14,
    rpcUrl: "https://worldchain-sepolia.drpc.org",
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MSG_TRANSMITTER,
    usdc: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://worldchain-sepolia.explorer.alchemy.com",
  },
  monad: {
    chainId: 10143,
    name: "Monad Testnet",
    domain: 15,
    rpcUrl: "https://testnet-rpc.monad.xyz",
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MSG_TRANSMITTER,
    usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3" as `0x${string}`,
    usdcDecimals: 6,
    fastTransferSupported: true,
    blockExplorer: "https://testnet.monadexplorer.com",
  },
  arc: {
    chainId: 5042002,
    name: "Arc Testnet",
    domain: 26,
    rpcUrl: "https://rpc.testnet.arc.network",
    tokenMessenger: TESTNET_TOKEN_MESSENGER,
    messageTransmitter: TESTNET_MSG_TRANSMITTER,
    usdc: "0x3600000000000000000000000000000000000000" as `0x${string}`,
    usdcDecimals: 18,
    fastTransferSupported: true,
    blockExplorer: "https://testnet.arcscan.app",
  },
} as const satisfies Record<string, ChainConfig>;

// ── Public types ──────────────────────────────────────────────────────────────

export type MainnetChain = keyof typeof MAINNET_CHAINS;
export type TestnetChain = keyof typeof TESTNET_CHAINS;
export type SupportedChain = MainnetChain | TestnetChain;

// ── Lookup ────────────────────────────────────────────────────────────────────

export function getChain(name: SupportedChain | string, env: Env): ChainConfig {
  const map = env === "testnet" ? TESTNET_CHAINS : MAINNET_CHAINS;
  const config = (map as Record<string, ChainConfig>)[name.toLowerCase()];
  if (!config) throw new UnsupportedChainError(`${name} (${env})`);
  return config;
}

export function getChainById(chainId: number, env: Env): ChainConfig {
  const map = env === "testnet" ? TESTNET_CHAINS : MAINNET_CHAINS;
  const config = Object.values(map).find(c => c.chainId === chainId);
  if (!config) throw new UnsupportedChainError(chainId);
  return config;
}
