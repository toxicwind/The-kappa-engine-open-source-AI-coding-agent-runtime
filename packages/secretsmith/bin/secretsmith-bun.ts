#!/usr/bin/env bun
/**
 * secretsmith-bun — CLI drop-in for the estate secretsmith, in pure Bun.
 *
 * Mirrors the Python CLI's surface: search / get / set / delete / list /
 * collections / lock / unlock, plus `--json`. Any Bun caller can also
 * `import * as secretsmith from "secretsmith"` directly (the `bun/` package).
 *
 * Examples:
 *   secretsmith-bun collections
 *   secretsmith-bun search --attr service=vercel
 *   secretsmith-bun get --attr service=vercel --show
 *   printf 'v_' | secretsmith-bun set --label my-key --attr service=me --attr app=cli
 *   secretsmith-bun delete --attr service=me --yes
 */
import * as sm from "../src/index";

async function cli(argv: string[]): Promise<number> {
  const cmd = argv[0] ?? "help";
  const jsonFlag = argv.includes("--json");
  const rest = argv.filter((a) => !a.startsWith("--json"));
  const flags = new Map<string, string>();
  const attr: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t === "--attr") { const kv = rest[++i]; const [k, v] = kv.split("=", 2); attr[k] = v ?? ""; }
    else if (t === "--label") flags.set("label", rest[++i]);
    else if (t === "--show") flags.set("show", "1");
    else if (t === "--collection") flags.set("collection", rest[++i]);
    else if (t === "--schema") flags.set("schema", rest[++i]);
    else if (t === "--replace") flags.set("replace", "1");
    else if (t === "--yes") flags.set("yes", "1");
  }
  const emit = (obj: unknown) => { process.stdout.write(JSON.stringify(obj, null, jsonFlag ? 0 : 2) + "\n"); };
  const human = (lines: string[]) => { if (!jsonFlag) process.stdout.write(lines.join("\n") + "\n"); };

  switch (cmd) {
    case "search":
    case "list": {
      const r = await sm.search(attr, { schema: flags.get("schema"), collection: flags.get("collection") });
      if (!r.ok) { process.stderr.write(r.error + "\n"); return 1; }
      emit({ items: r.items });
      human(r.items.map((i) => `${i.path} ${i.label}  (collection: ${i.collection})`));
      return 0;
    }
    case "get": {
      const item = await sm.get(attr, { collection: flags.get("collection") });
      if (!item) { process.stderr.write("no matching item\n"); return 1; }
      emit(item);
      if (jsonFlag) return 0;
      process.stdout.write(`${item.label}\n`);
      for (const [k, v] of Object.entries(item.attributes)) process.stdout.write(`    ${k} = ${v}\n`);
      if (flags.has("show")) process.stdout.write(`    secret = ${item.secret ?? "<locked>"}\n`);
      return 0;
    }
    case "set": {
      const label = flags.get("label");
      let secret = await new Promise<string>((res) => { let d = ""; process.stdin.on("data", (c: Buffer) => { d += c; }); process.stdin.on("end", () => res(d.trim())); });
      if (!label) { process.stderr.write("set requires --label\n"); return 2; }
      if (!secret && flags.get("secret-file")) { secret = ""; }
      const r = await sm.set(label, secret, attr, { replace: flags.has("replace"), collection: flags.get("collection") });
      if (!r.ok) { process.stderr.write(r.error ?? "set failed\n"); return 1; }
      emit({ ok: true, label });
      return 0;
    }
    case "delete": {
      const r = await sm.del(attr, { collection: flags.get("collection") });
      if (!r.ok) { process.stderr.write(r.error ?? "delete failed\n"); return 1; }
      emit({ ok: true });
      return 0;
    }
    case "collections": {
      const cols = await sm.collections();
      emit(cols);
      human(cols.map((c) => `${c.path}  label='${c.label}'  locked=${c.locked}  items=${c.items}${c.alias ? `  [${c.alias}]` : ""}`));
      return 0;
    }
    case "lock": {
      const r = await sm.lock(attr);
      if (!r.ok) { process.stderr.write(r.error ?? "lock failed\n"); return 1; }
      emit({ ok: true }); return 0;
    }
    case "unlock": {
      const r = await sm.unlock(attr);
      if (!r.ok) { process.stderr.write(r.error ?? "unlock failed\n"); return 1; }
      emit({ ok: true }); return 0;
    }
    case "--doctor": {
      const cols = await sm.collections();
      process.stdout.write(`secretsmith-bun: binary=ok collections=${cols.length}\n`);
      return cols.length ? 0 : 1;
    }
    case "help":
    default:
      process.stdout.write("secretsmith-bun drop-in: search | get | set | delete | list | collections | lock | unlock\n");
      return cmd === "help" ? 0 : 2;
  }
}

if (import.meta.main) process.exit(await cli(process.argv.slice(2)));