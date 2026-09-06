import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { E2E_CONTRACT, E2E_RPC } from "../../playwright.config";

const RPC = E2E_RPC;
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const QUOTE_SIGNER_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6" as Hex;
const TREASURY = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f";

let anvil: ChildProcess | null = null;

async function rpcUp(): Promise<boolean> {
  try {
    const client = createPublicClient({ chain: foundry, transport: http(RPC) });
    await client.getChainId();
    return true;
  } catch {
    return false;
  }
}

async function rpc(method: string): Promise<unknown> {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
  });
  const payload = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `${method} failed (${response.status})`);
  return payload.result;
}

export default async function globalSetup() {
  // NOTE: the web server is already running by the time global setup executes,
  // so its database and uploads are wiped in playwright.config.ts instead.
  const root = path.resolve(__dirname, "..", "..");

  const client = createPublicClient({ chain: foundry, transport: http(RPC) });

  // This dedicated port is reset on every run, so contract timestamps, nonces,
  // and protected-until state can never leak from a previous E2E invocation.
  const needAnvil = !(await rpcUp());
  if (needAnvil) {
    const bin = process.platform === "win32" ? "anvil.exe" : "anvil";
    anvil = spawn(bin, ["--chain-id", "31337", "--block-time", "1", "--port", "8546", "--silent"], {
      stdio: "ignore",
      env: { ...process.env, PATH: `${path.join(homedir(), ".foundry", "bin")}${path.delimiter}${process.env.PATH ?? ""}` },
    });
    anvil.unref();
    for (let i = 0; i < 60 && !(await rpcUp()); i++) await new Promise((r) => setTimeout(r, 500));
    if (!(await rpcUp())) throw new Error("anvil did not start");
  } else {
    const version = String(await rpc("web3_clientVersion"));
    if (!/anvil/i.test(version)) throw new Error("Port 8546 is occupied by a non-Anvil RPC; E2E will not reset it");
    await rpc("anvil_reset");
  }

  const artifactPath = path.join(root, "contracts", "out", "AirtimePayments.sol", "AirtimePayments.json");
  if (!existsSync(artifactPath)) throw new Error("Run `pnpm contract:build` first");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const account = privateKeyToAccount(DEPLOYER_KEY);
  const signer = privateKeyToAccount(QUOTE_SIGNER_KEY);
  const wallet = createWalletClient({ account, chain: foundry, transport: http(RPC) });
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object as Hex, args: [account.address, signer.address, TREASURY] });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.contractAddress?.toLowerCase() !== E2E_CONTRACT.toLowerCase()) {
    throw new Error(`Contract deployed at ${receipt.contractAddress}, expected ${E2E_CONTRACT} (is anvil fresh?)`);
  }
  console.log(`[e2e] AirtimePayments deployed at ${receipt.contractAddress}`);

  return async () => {
    anvil?.kill();
  };
}
