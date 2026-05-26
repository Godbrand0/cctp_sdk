import React, { createContext, useContext, useMemo } from "react";
import { CctpClient, type CctpClientConfig } from "@arc/cctp-sdk";

type CctpContextType = {
  client: CctpClient;
};

const CctpContext = createContext<CctpContextType | null>(null);

export type CctpProviderProps = {
  config?: Partial<CctpClientConfig>;
  children: React.ReactNode;
};

export const CctpProvider: React.FC<CctpProviderProps> = ({ config, children }) => {
  const client = useMemo(() => new CctpClient(config), [config]);

  return (
    <CctpContext.Provider value={{ client }}>
      {children}
    </CctpContext.Provider>
  );
};

export function useCctpClient(): CctpClient {
  const context = useContext(CctpContext);
  if (!context) {
    throw new Error("useCctpClient must be used within a CctpProvider");
  }
  return context.client;
}
