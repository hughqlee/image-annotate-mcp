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
