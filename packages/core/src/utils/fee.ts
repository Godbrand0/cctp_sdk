import { createPublicClient, http } from "viem";
import { getChain } from "../chains";
import { TOKEN_MESSENGER_ABI } from "../abis/TokenMessenger";
import type { TransferParams, FeeEstimate, CctpClientConfig } from "../types";

// Note: This needs to export getOrCreatePublicClient for use in transfer.ts as well
const publicClients = new Map<number, ReturnType<typeof createPublicClient>>();

export function getOrCreatePublicClient(chainId: number, rpcs?: Partial<Record<string, string>>) {
  if (publicClients.has(chainId)) return publicClients.get(chainId);
  
  const chainConfig = getChain(chainId);
  const rpcUrl = rpcs?.[chainConfig.name.toLowerCase()] || chainConfig.rpcUrl;
  
  const client = createPublicClient({
    transport: rpcUrl ? http(rpcUrl) : http(),
  });
  
  publicClients.set(chainId, client);
  return client;
}

export async function estimateFee(
  params: Pick<TransferParams, "sourceChain" | "destinationChain" | "amount" | "fast">,
  config: Required<CctpClientConfig>
): Promise<FeeEstimate> {
  const sourceChain = getChain(params.sourceChain);
  const destChain = getChain(params.destinationChain);
  const publicClient = getOrCreatePublicClient(sourceChain.chainId, config.rpcs);

  // Estimate gas for burn tx
  // Depending on whether it's fast lane or not, we might use a different signature, but the spec says both are named "depositForBurn" or "depositForBurnWithHook".
  // For basic estimation, we simulate standard depositForBurn
  const gasEstimate = await publicClient!.estimateContractGas({
    address: sourceChain.tokenMessenger,
    abi: TOKEN_MESSENGER_ABI,
    functionName: "depositForBurn",
    args: params.fast
      ? [params.amount, destChain.domain, ("0x" + "0".repeat(64)) as `0x${string}`, sourceChain.usdc, 0n] // maxFee = 0n for estimation
      : [params.amount, destChain.domain, ("0x" + "0".repeat(64)) as `0x${string}`, sourceChain.usdc],
  }).catch(() => 150000n); // fallback if simulation fails without actual balances

  const gasPrice = await publicClient!.getGasPrice();
  const gasCostWei = BigInt(gasEstimate) * BigInt(gasPrice);

  // Fast lane fee: Circle charges a % of transfer for fast attestation
  const bridgeFeeUsdc = params.fast
    ? (params.amount * 5n) / 10000n   // ~0.05% estimate
    : 0n;

  return {
    gasCostWei,
    bridgeFeeUsdc,
    estimatedSeconds: params.fast ? 2 : 20,
    isFast: !!params.fast,
  };
}
