// One read-only client for Robinhood Chain, shared by the pages that read contracts (lessons, league).
import { createPublicClient, defineChain, http } from "viem";
import { RPC_URL } from "./seal";

const chain = defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } });
export const client = createPublicClient({ chain, transport: http(RPC_URL) });
