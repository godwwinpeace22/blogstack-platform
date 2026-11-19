import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../public/r");
createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const match = /^\/r\/([a-z0-9-]+\.json)$/.exec(path);
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!match) { res.writeHead(404); res.end("Not found"); return; }
  try { const body = await readFile(resolve(root, match[1] ?? "")); res.setHeader("Content-Type", "application/json"); res.end(body); }
  catch { res.writeHead(404); res.end("Not found"); }
}).listen(4173, "127.0.0.1", () => console.log("Registry: http://localhost:4173/r/registry.json"));
