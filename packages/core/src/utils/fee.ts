import { createPublicClient, http } from "viem";
import { getChain, getChainById, MAINNET_CHAINS, TESTNET_CHAINS } from "../chains";
import type { TransferParams, FeeEstimate, CctpClientConfig } from "../types";
import type { Env } from "../chains";

const publicClients = new Map<number, ReturnType<typeof createPublicClient>>();

function findChainKey(chainId: number, env: Env): string | undefined {
  const map = env === "testnet" ? TESTNET_CHAINS : MAINNET_CHAINS;
  return Object.entries(map).find(([, c]) => c.chainId === chainId)?.[0];
}

export function getOrCreatePublicClient(
  chainId: number,
  rpcs?: Partial<Record<string, string>>,
  env: Env = "mainnet"
) {
  if (publicClients.has(chainId)) return publicClients.get(chainId);

  const chainConfig = getChainById(chainId, env);
  const chainKey = findChainKey(chainId, env);
  const rpcUrl = (chainKey ? rpcs?.[chainKey] : undefined) ?? chainConfig.rpcUrl;

  const client = createPublicClient({
    transport: rpcUrl ? http(rpcUrl) : http(),
  });

  publicClients.set(chainId, client);
  return client;
}

export async function estimateFee(
  params: Pick<TransferParams, "from" | "to" | "amount" | "fast">,
  config: Required<CctpClientConfig>
): Promise<FeeEstimate> {
  const sourceChain = getChain(params.from, config.env);
  const destChain = getChain(params.to, config.env);
  const publicClient = getOrCreatePublicClient(sourceChain.chainId, config.rpcs, config.env);

  const gasEstimate = await publicClient!.estimateContractGas({
    address: sourceChain.tokenMessenger,
    abi: [
      {
        name: "depositForBurn",
        type: "function",
        inputs: [
          { name: "amount", type: "uint256" },
          { name: "destinationDomain", type: "uint32" },
          { name: "mintRecipient", type: "bytes32" },
          { name: "burnToken", type: "address" },
          { name: "destinationCaller", type: "bytes32" },
          { name: "maxFee", type: "uint256" },
          { name: "minFinalityThreshold", type: "uint32" },
        ],
        outputs: [{ name: "nonce", type: "uint64" }],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "depositForBurn",
    args: [
      params.amount,
      destChain.domain,
      ("0x" + "0".repeat(64)) as `0x${string}`,
      sourceChain.usdc,
      ("0x" + "0".repeat(64)) as `0x${string}`,
      0n,
      params.fast ? 1000 : 0,
    ],
  }).catch(() => 150000n);

  const gasPrice = await publicClient!.getGasPrice();
  const gasCostWei = BigInt(gasEstimate) * BigInt(gasPrice);

  const bridgeFeeUsdc = params.fast ? (params.amount * 5n) / 10000n : 0n;

  return {
    gasCostWei,
    bridgeFeeUsdc,
    estimatedSeconds: params.fast ? 2 : 1200,
    isFast: !!params.fast,
  };
}
