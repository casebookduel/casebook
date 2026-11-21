"""Check a token address on Robinhood Chain before it goes on the site: it must hold code and answer symbol() with
the expected ticker, and, with --creator, have been launched by that wallet (the token's deployer() getter). Prints
what it read; exits 0 only when the check passes.
    python3 ops/check_ca.py 0x... [--symbol CASE] [--creator 0x...]"""
import json
import re
import sys
import urllib.request

RPC = "https://rpc.mainnet.chain.robinhood.com"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"


def call(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, body, {"content-type": "application/json", "user-agent": UA})
    r = json.load(urllib.request.urlopen(req, timeout=30))
    if "error" in r:
        raise SystemExit(f"rpc error: {r['error']}")
    return r["result"]


def text(hexdata):
    """an ABI-encoded string return value"""
    b = bytes.fromhex(hexdata[2:])
    if len(b) < 64:
        return b.rstrip(b"\0").decode(errors="replace")
    n = int.from_bytes(b[32:64], "big")
    return b[64:64 + n].decode(errors="replace")


def main():
    args = sys.argv[1:]
    ca = args[0] if args else ""
    want = args[args.index("--symbol") + 1] if "--symbol" in args else "CASE"
    creator = args[args.index("--creator") + 1].lower() if "--creator" in args else ""
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", ca):
        raise SystemExit("usage: python3 ops/check_ca.py 0x<40 hex> [--symbol CASE]")
    code = call("eth_getCode", [ca, "latest"])
    if len(code) <= 2:
        raise SystemExit(f"{ca} has no code: not a contract (yet?)")
    # symbol() 0x95d89b41, name() 0x06fdde03, decimals() 0x313ce567, totalSupply() 0x18160ddd
    sym = text(call("eth_call", [{"to": ca, "data": "0x95d89b41"}, "latest"]))
    name = text(call("eth_call", [{"to": ca, "data": "0x06fdde03"}, "latest"]))
    dec = int(call("eth_call", [{"to": ca, "data": "0x313ce567"}, "latest"]), 16)
    supply = int(call("eth_call", [{"to": ca, "data": "0x18160ddd"}, "latest"]), 16) / 10 ** dec
    print(f"{ca}: {len(code) // 2 - 1} bytes of code, name {name!r}, symbol {sym!r}, {dec} decimals, supply {supply:,.0f}")
    if sym != want:
        raise SystemExit(f"symbol is {sym!r}, expected {want!r}: not putting this address on the site")
    if creator:
        # deployer() 0xd5f39488 (keccak of the signature, checked against a live launch: it returns the launch's creator)
        dep = "0x" + call("eth_call", [{"to": ca, "data": "0xd5f39488"}, "latest"])[-40:]
        print(f"deployer {dep}")
        if dep.lower() != creator:
            raise SystemExit(f"deployer is {dep}, not our wallet {creator}: not putting this address on the site")
    print("ok")


if __name__ == "__main__":
    main()
