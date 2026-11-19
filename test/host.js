import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
window.__log = [];
window.startHost = async (html) => {
  const f = document.createElement("iframe");
  f.sandbox = "allow-scripts allow-same-origin"; f.style.cssText = "width:900px;height:600px";
  document.body.appendChild(f);
  const bridge = new AppBridge(null, { name: "TestHost", version: "1" },
    { updateModelContext: { text: {}, image: {} }, downloadFile: {}, serverTools: {} });
  bridge.onupdatemodelcontext = async (p) => { window.__log.push({ ev: "ctx", types: p.content.map(c => c.type), bytes: (p.content.find(c=>c.type==="image")?.data||"").length }); return {}; };
  bridge.ondownloadfile = async (p) => { const r = p.contents[0].resource; window.__log.push({ ev: "download", uri: r.uri, mime: r.mimeType, bytes: r.blob.length }); return {}; };
  bridge.oninitialized = () => window.__log.push({ ev: "initialized" });
  window.bridge = bridge;
  const ready = new Promise(r => f.onload = r);
  f.srcdoc = html; await ready;
  await bridge.connect(new PostMessageTransport(f.contentWindow, f.contentWindow));
};
