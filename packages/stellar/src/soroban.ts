import {
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  rpc,
  scValToNative,
  type Transaction,
  type xdr,
} from "@stellar/stellar-sdk";

/** Signs transactions. Implement against a KMS or remote signer in production. */
export interface Signer {
  publicKey(): string;
  signTransaction(tx: Transaction): Promise<Transaction>;
}

/** Local secret key signer. Fine for development; use a KMS/remote signer for real funds. */
export class KeypairSigner implements Signer {
  private keypair: Keypair;
  constructor(secret: string) {
    this.keypair = Keypair.fromSecret(secret);
  }
  publicKey() {
    return this.keypair.publicKey();
  }
  async signTransaction(tx: Transaction) {
    tx.sign(this.keypair);
    return tx;
  }
}

export interface InvokeResult {
  hash: string;
  ok: boolean;
  /** Raw failure detail, only set when ok is false. */
  detail?: string;
}

/** The only Soroban I/O the relayer needs. Swap in a fake for tests. */
export interface SorobanInvoker {
  invoke(contractId: string, method: string, args: xdr.ScVal[]): Promise<InvokeResult>;
  /** Read-only contract call, simulated rather than submitted. */
  read(contractId: string, method: string, args: xdr.ScVal[]): Promise<unknown>;
}

export interface RpcInvokerOptions {
  rpcUrl: string;
  passphrase: string;
  signer: Signer;
  /** Fee in stroops. Default: 100x the base fee, which covers typical Soroban resource fees on top of the simulated cost. */
  fee?: string;
  /** Seconds to poll for inclusion after submit. Default 90. */
  confirmTimeoutSec?: number;
}

export class RpcInvoker implements SorobanInvoker {
  private server: rpc.Server;
  constructor(private opts: RpcInvokerOptions) {
    this.server = new rpc.Server(opts.rpcUrl, { allowHttp: opts.rpcUrl.startsWith("http://") });
  }

  private async build(contractId: string, method: string, args: xdr.ScVal[]) {
    const account = await this.server.getAccount(this.opts.signer.publicKey());
    return new TransactionBuilder(account, {
      fee: this.opts.fee ?? (Number(BASE_FEE) * 100).toString(),
      networkPassphrase: this.opts.passphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(60)
      .build();
  }

  async invoke(contractId: string, method: string, args: xdr.ScVal[]): Promise<InvokeResult> {
    const tx = await this.build(contractId, method, args);
    const prepared = await this.server.prepareTransaction(tx);
    const signed = await this.opts.signer.signTransaction(prepared);
    const sent = await this.server.sendTransaction(signed);
    if (sent.status !== "PENDING") {
      return { hash: sent.hash, ok: false, detail: `send ${sent.status}: ${JSON.stringify(sent.errorResult ?? "")}` };
    }
    // NOT_FOUND is normal for a few seconds after submission (indexing lag).
    const deadline = Date.now() + (this.opts.confirmTimeoutSec ?? 90) * 1000;
    let final = await this.server.getTransaction(sent.hash);
    while (final.status === rpc.Api.GetTransactionStatus.NOT_FOUND && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      final = await this.server.getTransaction(sent.hash);
    }
    if (final.status === rpc.Api.GetTransactionStatus.SUCCESS) return { hash: sent.hash, ok: true };
    return { hash: sent.hash, ok: false, detail: `${final.status}: ${JSON.stringify(final).slice(0, 500)}` };
  }

  async read(contractId: string, method: string, args: xdr.ScVal[]): Promise<unknown> {
    const tx = await this.build(contractId, method, args);
    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
      throw new Error(`simulation of ${method} failed`);
    }
    return scValToNative(sim.result.retval);
  }
}
