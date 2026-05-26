import { describe, it, expect } from "vitest";
import { startMockAttestor, deployMockCctp } from "../src";

describe("Hardhat Plugin Exports", () => {
  it("should export mock attestor and fixtures successfully", () => {
    expect(startMockAttestor).toBeTypeOf("function");
    expect(deployMockCctp).toBeTypeOf("function");
  });
});
