import { handler } from "../lib/server.js";
const call = async (body) => { const r = await handler.fetch(new Request("http://localhost/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify(body) })); return [r.status, (await r.text()).slice(0, 300)]; };
console.log(await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } }, clientInfo: { name: "t", version: "1" } } }));
console.log(await call({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
console.log(await call({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "ui://annotate/app.html" } }));
console.log(await call({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "apply_marks", arguments: { marks: [{ type: "rect", x: 1, y: 2, w: 3, h: 4 }] } } }));
