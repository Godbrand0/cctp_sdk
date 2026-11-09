export const states = [
  "IDLE",
  "APPROVING",
  "APPROVED",
  "BURNING",
  "BURNED",
  "AWAITING_ATTESTATION",
  "ATTESTED",
  "RELAYING",
  "COMPLETE",
] as const;

export const manualSteps = [
  "Check allowance and submit USDC approval",
  "Call depositForBurn with 7 arguments",
  "Extract the MessageSent event from the receipt",
  "Poll Circle's Iris attestation API until status is complete",
  "Use Iris-provided message bytes (raw event bytes carry a zero nonce in v2)",
  "Submit receiveMessage on the destination chain",
  "Wait for confirmation",
];

export const packages = [
  {
    name: "@cctp-sdk/core",
    version: "0.2.1",
    npm: "https://www.npmjs.com/package/@cctp-sdk/core",
    blurb:
      "The main SDK. CctpClient runs approve → burn → attest → relay, with a resumable state machine, fee estimation, fast lane and destination hooks. Built on viem v2.",
  },
  {
    name: "@cctp-sdk/react",
    version: "0.1.0",
    blurb:
      "React bindings: CctpProvider, useTransfer, useEstimateFee and a TransferStatusBadge component.",
  },
  {
    name: "@cctp-sdk/stellar",
    version: "0.0.2",
    npm: "https://www.npmjs.com/package/@cctp-sdk/stellar",
    blurb:
      "Let a Soroban contract act on inbound CCTP V2 USDC for a specific user, using instructions inside Circle's attested message. hookData codec, message parser, Iris client and a resumable, idempotent StellarRelayer. Pre-alpha.",
  },
  {
    name: "@cctp-sdk/hardhat",
    version: "0.1.0",
    blurb:
      "Local test helpers: a mock attestor server that signs any message hash, plus fixtures for CCTP on a forked chain.",
  },
  {
    name: "attested-receiver (Rust)",
    version: "0.0.4",
    blurb:
      "Soroban crate that verifies CCTP attestations, parses messages, computes the delivered amount and records processed nonces. The on-chain half of the Stellar package.",
  },
  {
    name: "cctp-receiver (Soroban)",
    version: "contract",
    blurb:
      "Deployable receiver built on attested-receiver. Anyone can call process(message, attestation); it pays the attested recipient directly or through an action, and falls back to plain USDC if the action fails.",
  },
];

export const params = [
  ["from", "SupportedChain", "Source chain key, e.g. \"base\""],
  ["to", "SupportedChain", "Destination chain key, e.g. \"arbitrum\""],
  ["amount", "bigint", "USDC base units; parseUnits(\"10\", 6) = 10 USDC"],
  ["fast", "boolean", "Use the v2 fast lane; the minimum fee is fetched from Iris"],
  ["recipient", "Address", "Destination recipient. Defaults to the sender"],
  ["maxFee", "bigint", "Override the fast lane fee"],
  ["hook", "TransferHook", "Contract call executed at mint time on the destination"],
  ["hookExecutor", "Address", "Executor contract on the destination (required with hook)"],
];

export const mainnet = [
  ["ethereum", "Ethereum", "1", "0"],
  ["avalanche", "Avalanche", "43114", "1"],
  ["optimism", "Optimism", "10", "2"],
  ["arbitrum", "Arbitrum", "42161", "3"],
  ["base", "Base", "8453", "6"],
  ["polygon", "Polygon", "137", "7"],
  ["unichain", "Unichain", "130", "10"],
  ["linea", "Linea", "59144", "11"],
  ["sonic", "Sonic", "146", "13"],
  ["worldchain", "World Chain", "480", "14"],
];

export const testnet = [
  ["ethereum", "Ethereum Sepolia", "11155111", "0"],
  ["avalanche", "Avalanche Fuji", "43113", "1"],
  ["optimism", "OP Sepolia", "11155420", "2"],
  ["arbitrum", "Arbitrum Sepolia", "421614", "3"],
  ["base", "Base Sepolia", "84532", "6"],
  ["polygon", "Polygon Amoy", "80002", "7"],
  ["unichain", "Unichain Sepolia", "1301", "10"],
  ["linea", "Linea Sepolia", "59141", "11"],
  ["sonic", "Sonic Testnet", "57054", "13"],
  ["worldchain", "World Chain Sepolia", "4801", "14"],
  ["monad", "Monad Testnet", "10143", "15"],
  ["arc", "Arc Testnet", "5042002", "26"],
];

export const quickStart = `import { CctpClient } from "@cctp-sdk/core";
import { createWalletClient, http, parseUnits } from "viem";
import { mainnet } from "viem/chains";

const client = new CctpClient({ env: "mainnet" });
const wallet = createWalletClient({ chain: mainnet, transport: http(RPC_URL) });

const transfer = await client.transfer(
  { from: "ethereum", to: "base", amount: parseUnits("10", 6), fast: true },
  wallet
);

transfer.on("stateChange", (snap) => console.log(snap.state));
const result = await transfer.wait();
console.log("Relay tx:", result.destinationTxHash);`;

export const resumeCode = `const transfer = await client.resume(transferId, wallet);
await transfer.wait();

// or recover from nothing but a burn tx hash
const snap = await client.getStatus("0xBurnTxHash", "base");`;

export const hookCode = `await client.transfer(
  {
    from: "base",
    to: "arbitrum",
    amount: parseUnits("50", 6),
    fast: true,
    hook: {
      target: "0xYourContract",
      calldata: "0x...",
      forwardAmount: parseUnits("50", 6),
    },
    hookExecutor: "0xYourHookExecutor",
  },
  wallet
);`;

export const feeCode = `const fee = await client.estimateFee({
  from: "ethereum", to: "base",
  amount: parseUnits("100", 6), fast: true,
});
// fee.gasCostWei, fee.bridgeFeeUsdc, fee.estimatedSeconds`;

export const reactCode = `<CctpProvider config={{ env: "testnet" }}>
  <App />
</CctpProvider>

const { transfer, state, isLoading } = useTransfer();
const { estimate } = useEstimateFee({ from, to, amount, fast: true });
<TransferStatusBadge state={state} />`;

export const receiverOutcomes = [
  ["Delivered", "No action configured", "USDC sent to the recipient"],
  ["Executed", "Action succeeds and pulls the full amount", "Action's output goes to the recipient"],
  ["Fallback", "Action fails or misses min_out, or pulls less", "Action rolled back; USDC (or the remainder) sent to the recipient"],
];

export const stellarCode = `const relayer = new StellarRelayer({
  network: STELLAR_TESTNET,
  invoker: new RpcInvoker({ rpcUrl, passphrase: STELLAR_TESTNET.passphrase,
                            signer: new KeypairSigner(secret) }),
  attestations: new IrisClient(IRIS_SANDBOX),
  // your deployed cctp-receiver
  consumer: { contractId: RECEIVER, method: "process",
              isDeliveredMethod: "is_delivered" },
});
await relayer.relay(burnTxHash, sourceDomain);`;
