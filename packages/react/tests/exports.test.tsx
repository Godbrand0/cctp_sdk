import { describe, it, expect } from "vitest";
import { useTransfer, useEstimateFee, CctpProvider, TransferStatusBadge } from "../src";

describe("React Exports", () => {
  it("should export all hooks and components successfully", () => {
    expect(useTransfer).toBeTypeOf("function");
    expect(useEstimateFee).toBeTypeOf("function");
    expect(CctpProvider).toBeTypeOf("function");
    expect(TransferStatusBadge).toBeTypeOf("function");
  });
});
