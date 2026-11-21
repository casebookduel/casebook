import { test } from "node:test";
import assert from "node:assert/strict";
import { clientKey, sameOrigin, smallJson } from "./request.ts";

const req = (headers: Record<string, string>, body?: string) => new Request("http://casebook.test/api/case", { method: "POST", headers, body });

test("same origin: no Origin passes, the site's own host passes, null and other sites do not", () => {
  assert.equal(sameOrigin(req({ host: "casebook.test" })), true);
  assert.equal(sameOrigin(req({ host: "casebook.test", origin: "https://casebook.test" })), true);
  assert.equal(sameOrigin(req({ host: "casebook.test", origin: "null" })), false);
  assert.equal(sameOrigin(req({ host: "casebook.test", origin: "https://evil.test" })), false);
});

test("client key: IPv4 as it is, IPv6 cut to its /64 however it is written", () => {
  assert.equal(clientKey(req({ "cf-connecting-ip": "203.0.113.9" })), "203.0.113.9");
  assert.equal(clientKey(req({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" })), "198.51.100.7");
  const a = clientKey(req({ "cf-connecting-ip": "2001:db8:abcd:12::1" }));
  const b = clientKey(req({ "cf-connecting-ip": "2001:0db8:abcd:0012:ffff:1:2:3" }));
  assert.equal(a, "2001:db8:abcd:12::/64");
  assert.equal(a, b);
  assert.equal(clientKey(req({ "cf-connecting-ip": "::1" })), "0:0:0:0::/64");
});

test("small JSON: parsed when small, refused when big, wrong type or broken", async () => {
  assert.deepEqual(await smallJson(req({ "content-type": "application/json" }, '{"a":1}')), { body: { a: 1 } });
  assert.deepEqual(await smallJson(req({ "content-type": "text/plain" }, '{"a":1}')), { status: 415 });
  assert.deepEqual(await smallJson(req({ "content-type": "application/json" }, "x".repeat(5000))), { status: 413 });
  assert.deepEqual(await smallJson(req({ "content-type": "application/json", "content-length": "99999" }, "{}")), { status: 413 });
  assert.deepEqual(await smallJson(req({ "content-type": "application/json" }, "{nope")), { status: 400 });
});
