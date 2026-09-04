import "./_env";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

/**
 * Deploys AirtimePayments to the local anvil chain and writes the address into
 * .env.local so `pnpm dev` picks it up.
 *
 * Prerequisites: `pnpm contract:build` (forge build) and a running `pnpm chain:local`.
 *
 * Accounts (anvil defaults):
 *   #0 deployer / owner
 *   #8 treasury
 *   #9 quote signer (matches the dev fallback in quoteSigner.ts)
 */
const RPC = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const TREASURY = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f";
const QUOTE_SIGNER_KEY = (process.env.AIRTIME_QUOTE_SIGNER_PRIVATE_KEY || "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6") as Hex;

async function main() {
  const artifactPath = path.join(process.cwd(), "contracts", "out", "AirtimePayments.sol", "AirtimePayments.json");
  if (!existsSync(artifactPath)) throw new Error("Contract artifact missing. Run `pnpm contract:build` first.");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const bytecode = artifact.bytecode.object as Hex;
  const abi = artifact.abi;

  const account = privateKeyToAccount(DEPLOYER_KEY);
  const signer = privateKeyToAccount(QUOTE_SIGNER_KEY);
  const wallet = createWalletClient({ account, chain: foundry, transport: http(RPC) });
  const client = createPublicClient({ chain: foundry, transport: http(RPC) });

  const hash = await wallet.deployContract({ abi, bytecode, args: [account.address, signer.address, TREASURY] });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error("Deployment failed");

  console.log("AirtimePayments deployed");
  console.log("  address      ", receipt.contractAddress);
  console.log("  block        ", receipt.blockNumber.toString());
  console.log("  owner        ", account.address);
  console.log("  quote signer ", signer.address);
  console.log("  treasury     ", TREASURY);

  const envPath = path.join(process.cwd(), ".env.local");
  let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const set = (key: string, value: string) => {
    const re = new RegExp(`^${key}=.*$`, "m");
    content = re.test(content) ? content.replace(re, `${key}=${value}`) : `${content.trimEnd()}\n${key}=${value}\n`;
  };
  set("NEXT_PUBLIC_AIRTIME_PAYMENT_CONTRACT", receipt.contractAddress);
  set("AIRTIME_PAYMENT_CONTRACT_DEPLOY_BLOCK", receipt.blockNumber.toString());
  set("TREASURY_ADDRESS", TREASURY);
  writeFileSync(envPath, content);
  console.log("  wrote .env.local");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
