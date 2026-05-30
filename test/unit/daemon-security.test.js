import { describe, it } from "node:test";
import assert from "node:assert";

function isOriginAllowed(origin, roleHint) {
  if (!origin || origin === "null") return true;
  try {
    const parsed = new URL(origin);
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol === "chrome-extension:") {
      const id = parsed.hostname;
      if (!id || id.includes("/")) return false;
      return roleHint === "extension" || roleHint === "any";
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      const hostname = parsed.hostname;
      return hostname === "localhost" || hostname === "127.0.0.1";
    }
  } catch (e) {
    

  }
  return false;
}

function checkRateLimit(ip, rateLimits = new Map(), now = Date.now()) {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return { allowed: true };
  const RATE_LIMIT_WINDOW_MS = 10000;
  const RATE_LIMIT_MAX_MSG = 100;
  const RATE_LIMIT_MAX_BURST = 20;
  let rl = rateLimits.get(ip);
  if (!rl) {
    rl = { count: 0, reset: now + RATE_LIMIT_WINDOW_MS, burst: 0, burstReset: now + 1000 };
    rateLimits.set(ip, rl);
  }
  if (now > rl.reset) { rl.count = 0; rl.reset = now + RATE_LIMIT_WINDOW_MS; }
  if (now > rl.burstReset) { rl.burst = 0; rl.burstReset = now + 1000; }
  rl.count++; rl.burst++;
  if (rl.burst > RATE_LIMIT_MAX_BURST) return { allowed: false, reason: "burst" };
  if (rl.count > RATE_LIMIT_MAX_MSG) return { allowed: false, reason: "window" };
  return { allowed: true };
}

describe("Daemon Security", () => {
  it("allows null origin for any role", () => {
    assert.strictEqual(isOriginAllowed(null, "extension"), true);
    assert.strictEqual(isOriginAllowed("null", "controller"), true);
  });

  it("allows chrome-extension origin for extension", () => {
    assert.strictEqual(isOriginAllowed("chrome-extension://abc123", "extension"), true);
    assert.strictEqual(isOriginAllowed("chrome-extension://abc123", "controller"), false);
  });

  it("allows localhost origins", () => {
    assert.strictEqual(isOriginAllowed("http://localhost:8080", "controller"), true);
    assert.strictEqual(isOriginAllowed("https://127.0.0.1:3000", "controller"), true);
  });

  it("rejects suspicious origins", () => {
    assert.strictEqual(isOriginAllowed("https://evil.com", "controller"), false);
    assert.strictEqual(isOriginAllowed("https://evil.com", "extension"), false);
  });

  it("exempts localhost from rate limiting", () => {
    assert.strictEqual(checkRateLimit("127.0.0.1").allowed, true);
    assert.strictEqual(checkRateLimit("::ffff:127.0.0.1").allowed, true);
  });

  it("blocks burst from remote IP", () => {
    const rl = new Map();
    const now = Date.now();
    for (let i = 0; i < 25; i++) {
      const result = checkRateLimit("192.168.1.100", rl, now);
      if (i < 20) assert.strictEqual(result.allowed, true);
      else assert.strictEqual(result.allowed, false);
    }
  });
});
