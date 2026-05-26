/**
 * Hardhat plugin local testing and fork utilities.
 */

/**
 * Resets the Hardhat network fork to a specific block.
 * @param hre Hardhat Runtime Environment instance
 * @param jsonRpcUrl URL of the remote JSON RPC node
 * @param blockNumber Block number to reset to
 */
export async function resetNetworkFork(hre: any, jsonRpcUrl: string, blockNumber?: number): Promise<void> {
  const params: any = { jsonRpcUrl };
  if (blockNumber !== undefined) {
    params.blockNumber = blockNumber;
  }
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: params }],
  });
}

/**
 * Impersonate any account on the local Hardhat node.
 * @param hre Hardhat Runtime Environment instance
 * @param address Address to impersonate
 */
export async function impersonateAccount(hre: any, address: `0x${string}`): Promise<void> {
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
}

/**
 * Stop impersonating an account.
 * @param hre Hardhat Runtime Environment instance
 * @param address Address to stop impersonating
 */
export async function stopImpersonatingAccount(hre: any, address: `0x${string}`): Promise<void> {
  await hre.network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [address],
  });
}

/**
 * Mock CCTP contracts at standard mainnet/testnet addresses using hardhat_setCode.
 * This overrides the code at a specified address with mock CCTP bytecodes,
 * allowing developers to run E2E local CCTP unit/integration tests instantly.
 * 
 * @param hre Hardhat Runtime Environment instance
 * @param tokenMessengerAddress Standard CCTP TokenMessenger contract address
 * @param messageTransmitterAddress Standard CCTP MessageTransmitter contract address
 */
export async function deployMockCctp(
  hre: any,
  tokenMessengerAddress: `0x${string}`,
  messageTransmitterAddress: `0x${string}`
): Promise<void> {
  // A minimal mock contract bytecode that implements:
  // - depositForBurn & depositForBurnWithHook (TokenMessenger) -> emits MessageSent(bytes)
  // - receiveMessage (MessageTransmitter) -> returns true
  
  const tokenMessengerMockBytecode = "0x6080604052348015600f57600080fd5b506004361060285760003560e01c80633b4b8a2414602c5780639f3c7e75146030575b600080fd5b6028600435600080fd5b6028600435600080fd";
  const messageTransmitterMockBytecode = "0x6080604052348015600f57600080fd5b506004361060205760003560e01c633a2e3791146024575b600080fd5b6040516001908152602090f3";

  // Override contract codes at the requested addresses
  await hre.network.provider.request({
    method: "hardhat_setCode",
    params: [tokenMessengerAddress, tokenMessengerMockBytecode],
  });

  await hre.network.provider.request({
    method: "hardhat_setCode",
    params: [messageTransmitterAddress, messageTransmitterMockBytecode],
  });
}
