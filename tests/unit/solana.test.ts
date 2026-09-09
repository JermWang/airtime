import { expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { isSolanaAddress, signInMessage } from "@/lib/chain/solana";
import { parseSol, formatUnits } from "@/lib/units";
import { issueUploadTicket, verifyUploadTicket } from "@/server/auth/uploadTicket";
it("converts SOL without floating-point rounding", () => {
 expect(parseSol("0.01")).toBe(10000000n); expect(formatUnits(1n)).toBe("0.000000001");
 expect(() => parseSol("0.0000000001")).toThrow(); expect(() => parseSol("-1")).toThrow();
});
it("binds signatures to the site, wallet, network and nonce", () => {
 const key = Keypair.generate(); const fields={ address:key.publicKey.toBase58(), origin:"https://airtime.media", chainId:900, nonce:"test" };
 const bytes = new TextEncoder().encode(signInMessage(fields)); const signature=nacl.sign.detached(bytes,key.secretKey);
 expect(nacl.sign.detached.verify(bytes,signature,key.publicKey.toBytes())).toBe(true);
 for(const altered of [{origin:"https://other.example"},{nonce:"other"},{chainId:901}]) expect(nacl.sign.detached.verify(new TextEncoder().encode(signInMessage({...fields,...altered})),signature,key.publicKey.toBytes())).toBe(false);
 expect(isSolanaAddress(fields.address)).toBe(true); expect(isSolanaAddress("0x123")).toBe(false);
});
it("keeps upload authorization case-sensitive", () => {
 const address=Keypair.generate().publicKey.toBase58(); const ticket=issueUploadTicket(address,"AD");
 expect(verifyUploadTicket(ticket,address,"AD")).toBe(true);
 expect(verifyUploadTicket(ticket,address.toLowerCase(),"AD")).toBe(false);
});
