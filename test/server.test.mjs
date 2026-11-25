import { handler } from "../lib/server.js";
const call = async (body) => { const r = await handler.fetch(new Request("http://localhost/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify(body) })); return [r.status, (await r.text()).slice(0, 300)]; };
console.log(await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } }, clientInfo: { name: "t", version: "1" } } }));
console.log(await call({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
console.log(await call({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "ui://annotate/app.html" } }));
console.log(await call({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "apply_marks", arguments: { marks: [{ type: "rect", x: 1, y: 2, w: 3, h: 4 }] } } }));

// bounds: oversized / malformed tool input must be rejected
const bad = await call({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "apply_marks", arguments: { marks: Array.from({ length: 201 }, () => ({ type: "rect", x: 0, y: 0, w: 1, h: 1 })) } } });
const bad2 = await call({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "apply_marks", arguments: { marks: [{ type: "rect", x: 0, y: 0, w: 1, h: 1, color: "red;}<script>" }] } } });
const big = await handler.fetch(new Request("http://localhost/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: { pad: "x".repeat(300 * 1024) } }) }));
const isErr = r => /isError":true|"error"/.test(r[1]);
console.log(isErr(bad) ? "PASS" : "FAIL", "rejects more than 200 marks");
console.log(isErr(bad2) ? "PASS" : "FAIL", "rejects invalid colour");
console.log(big.status === 413 ? "PASS" : "FAIL", "rejects body over 256 KiB (status " + big.status + ")");
if (!isErr(bad) || !isErr(bad2) || big.status !== 413) process.exit(1);

// Directory listing requirements: every tool has a title and explicit readOnly/destructive/openWorld hints;
// the server reports its name, title and icons; the public pages exist.
{
  const raw = async (body) => (await handler.fetch(new Request("http://localhost/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify(body) }))).text();
  const json = s => JSON.parse(s.split("\n").find(l => l.startsWith("data: ")).slice(6));
  const init = json(await raw({ jsonrpc: "2.0", id: 90, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } })).result.serverInfo;
  const tools = json(await raw({ jsonrpc: "2.0", id: 91, method: "tools/list", params: {} })).result.tools;
  const fs = await import("node:fs");
  const checks = [
    [init.title && init.version && init.icons?.length && init.websiteUrl, "serverInfo has title, version, websiteUrl, icons: " + init.name],
    [tools.every(t => t.title && t.annotations?.title === t.title && ["readOnlyHint", "destructiveHint", "openWorldHint"].every(k => typeof t.annotations[k] === "boolean")), "every tool has a title (top-level and in annotations) and explicit hints"],
    [["index.html", "privacy.html", "terms.html", "icon.png", "icon.svg", "screenshot.png"].every(f => fs.existsSync("public/" + f)), "public guide, privacy, terms, icon, screenshot built"],
    [JSON.parse(fs.readFileSync("server.json", "utf8")).version === init.version, "server.json version matches the server"],
  ];
  for (const [c, m] of checks) console.log(c ? "PASS" : "FAIL", m);
  if (!checks.every(([c]) => c)) process.exit(1);
}
