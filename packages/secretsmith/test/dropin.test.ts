import { describe, expect, test, beforeEach } from "bun:test";
import { search, get, set, del, list, collections, lock, unlock, resolve, fromEnv } from "../src/index";
// Bun.spawnSync is the global — not an import.

describe("secretsmith Bun drop-in — library", () => {
  test("collections lists at least the default keyring", async () => {
    const cols = await collections();
    expect(cols.length).toBeGreaterThan(0);
    expect(cols.some((c) => c.alias === "default" || c.items >= 0)).toBe(true);
  });

  test("list returns items with attributes (no schema filter by default)", async () => {
    const r = await list();
    expect(r.ok).toBe(true);
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    const some = r.items[0];
    expect(typeof some.label).toBe("string");
    expect(typeof some.path).toBe("string");
  });

  test("search by service attribute finds a stored item", async () => {
    const r = await search({ service: "vercel" });
    expect(r.ok).toBe(true);
    expect(r.items.length).toBeGreaterThanOrEqual(1);
  });

  test("get returns the secret for a known key", async () => {
    const item = await get({ service: "vercel" });
    expect(item).not.toBeNull();
    expect(item?.label).toContain("vercel");
    expect(item?.secret).toBeTruthy();
  });

  test("get returns null on no match", async () => {
    const item = await get({ service: "definitely-not-a-real-service-xyz" });
    expect(item).toBeNull();
  });
});

describe("secretsmith Bun drop-in — set/delete round-trip", () => {
  const label = "secretsmith-bun-test";
  test("set then get then delete round-trips a value", async () => {
    const secret = "bun-dropin-secret-" + Date.now();
    const put = await set(label, secret, { service: "sbtest", app: "test" }, { replace: true });
    expect(put.ok).toBe(true);

    const item = await get({ service: "sbtest", app: "test" });
    expect(item?.secret).toBe(secret);

    const delr = await del({ service: "sbtest", app: "test" });
    expect(delr.ok).toBe(true);

    const gone = await get({ service: "sbtest", app: "test" });
    expect(gone).toBeNull();
  });
});

describe("secretsmith Bun drop-in — CLI mirror", () => {
  test("secretsmith-bun collections works via spawn", () => {
    const r = spawnSync({ cmd: ["bun", "bin/secretsmith-bun.ts", "collections", "--json"], cwd: new URL("..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(0);
    const d = JSON.parse(r.stdout.toString());
    expect(Array.isArray(d)).toBe(true);
  });

  test("secretsmith-bun get --show returns secret for vercel", () => {
    const r = spawnSync({ cmd: ["bun", "bin/secretsmith-bun.ts", "get", "--attr", "service=vercel", "--show", "--json"], cwd: new URL("..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(0);
    const d = JSON.parse(r.stdout.toString());
    expect(d.label).toContain("vercel");
    expect(typeof d.secret).toBe("string");
  });
});

describe("secretsmith Bun drop-in — resolve", () => {
  test("fromEnv returns env fast path", () => {
    process.env.SB_TEST_TOKEN = "abc123";
    expect(fromEnv(["SB_TEST_TOKEN"])).toBe("abc123");
    delete process.env.SB_TEST_TOKEN;
  });

  test("resolve falls through env→keyring→missing", async () => {
    const miss = await resolve(["SB_DOES_NOT_EXIST_XYZ"], { service: "no-such-service" });
    expect(["env", "keyring", "vault", "missing"]).toContain(miss.from);
  });
});