// Browser test: loads the built UI into a spec-style test host (sandboxed iframe + AppBridge)
// under the default MCP Apps CSP, then checks image input, agent marks, drag preview, export, i18n and theme.
// Usage: npm run build && npm run test:e2e
const { chromium } = require("playwright"); const http = require("http"); const fs = require("fs"); const path = require("path");
const { buildSync } = require("esbuild");
const out = path.join(__dirname, ".build"); fs.mkdirSync(out, { recursive: true });
buildSync({ entryPoints: [path.join(__dirname, "host.js")], bundle: true, format: "iife", outfile: path.join(out, "host.js"), logLevel: "warning" });
fs.writeFileSync(path.join(out, "host.html"), '<!doctype html><html><body><script src="host.js"></script></body></html>');
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'">`;
let failures = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) failures++; };
(async () => {
  const ui = (await import(path.join(__dirname, "../lib/ui-html.js"))).default.replace("<head>", "<head>" + CSP);
  const srv = http.createServer((q, r) => { const p = path.join(out, q.url.split("?")[0]); fs.existsSync(p) ? r.end(fs.readFileSync(p)) : (r.statusCode = 404, r.end()); }).listen(0);
  const base = `http://localhost:${srv.address().port}/host.html`;
  const b = await chromium.launch();
  const open = async (opts = {}) => {
    const pg = await b.newPage({ viewport: { width: 1000, height: 700 }, locale: "en-US", colorScheme: "light", ...opts });
    pg.on("pageerror", e => ok(false, "page error: " + e.message));
    await pg.goto(base); await pg.evaluate(h => startHost(h), ui);
    const fr = pg.frames()[1]; await fr.waitForFunction(() => /Ready|준비됨/.test(document.getElementById("st").textContent));
    return [pg, fr];
  };
  const st = fr => fr.textContent("#st");
  const png = async (pg, w, h) => Buffer.from(await pg.evaluate(([w, h]) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
    for (let i = 0; i < w; i += 10) { x.fillStyle = i % 20 ? "#000" : "#fff"; x.fillRect(i, 0, 10, h); } return c.toDataURL().split(",")[1]; }, [w, h]), "base64");

  // 1. image input + agent context + agent marks + export
  let [pg, fr] = await open();
  const img = path.join(out, "t.png"); fs.writeFileSync(img, await png(pg, 300, 150));
  await fr.setInputFiles("#file", img); await fr.waitForFunction(() => /Loaded/.test(document.getElementById("st").textContent));
  ok((await st(fr)) === "Loaded 300×150", "file input loads image");
  ok(!(await fr.isVisible("#hint")), "paste hint is hidden once an image is loaded");
  await fr.evaluate(b64 => { const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([u], "p.png", { type: "image/png" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt })); }, fs.readFileSync(img).toString("base64"));
  await fr.evaluate(b64 => { const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([u], "d.png", { type: "image/png" }));
    document.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, cancelable: true })); }, fs.readFileSync(img).toString("base64"));
  await pg.waitForTimeout(400);
  const ctxEv = await pg.evaluate(() => __log.filter(e => e.ev === "ctx"));
  ok(ctxEv.length === 3 && ctxEv.every(e => e.types.join() === "image,text"), "file/paste/drop each send image to the model context");
  await pg.evaluate(() => bridge.sendToolResult({ content: [], structuredContent: { marks: [{ type: "rect", x: 100, y: 20, w: 80, h: 50 }, { type: "highlight", x: 200, y: 20, w: 80, h: 50 }] } }));
  await pg.waitForTimeout(200);
  const px = await fr.evaluate(() => { const g = document.getElementById("cv").getContext("2d"); const p = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3).join(","); return [p(100, 40), p(205, 40)]; });
  ok(px[0] === "225,29,29", "agent rect mark drawn"); ok(px[1].startsWith("255,"), "agent highlight mark drawn");
  // agent-chosen colour; invalid colour falls back to the default
  await pg.evaluate(() => bridge.sendToolResult({ content: [], structuredContent: { marks: [{ type: "rect", x: 20, y: 100, w: 40, h: 30, color: "#0000ff" }, { type: "rect", x: 240, y: 100, w: 40, h: 30, color: "red;}<script>" }] } }));
  await pg.waitForTimeout(150);
  const px2 = await fr.evaluate(() => { const g = document.getElementById("cv").getContext("2d"); const p = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3).join(","); return [p(20, 115), p(240, 115)]; });
  ok(px2[0] === "0,0,255", "agent colour applied"); ok(px2[1] === "225,29,29", "invalid colour ignored");
  ok((await fr.textContent("#undo")) === "Undo", "undo label (en)");
  // redact: fully opaque black by default, from the agent
  await pg.evaluate(() => bridge.sendToolResult({ content: [], structuredContent: { marks: [{ type: "redact", x: 0, y: 0, w: 40, h: 40 }] } }));
  await pg.waitForTimeout(150);
  ok(await fr.evaluate(() => { const d = document.getElementById("cv").getContext("2d").getImageData(0, 0, 40, 40).data; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2] || d[i + 3] !== 255) return false; return true; }), "redact covers the area with opaque black");
  await fr.click("#export"); await pg.waitForTimeout(200);
  const dl = await pg.evaluate(() => __log.filter(e => e.ev === "download"));
  ok(dl.length === 1 && dl[0].mime === "image/png", "export sends PNG via ui/download-file");
  await pg.close();

  // 2. drag with preview
  [pg, fr] = await open();
  const big = path.join(out, "big.png"); fs.writeFileSync(big, await png(pg, 1600, 900));
  await fr.setInputFiles("#file", big); await fr.waitForFunction(() => /Loaded/.test(document.getElementById("st").textContent));
  await fr.click('[data-tool="mosaic"]');
  ok(!(await fr.isVisible("#color")) && await fr.isVisible("#strength"), "mosaic shows strength, hides colour");
  ok(await fr.getAttribute('[data-tool="mosaic"]', "aria-pressed") === "true", "selected tool is marked");
  const bx = await (await fr.$("#ov")).boundingBox(); const k = bx.width / 1600; const P = (x, y) => [bx.x + x * k, bx.y + y * k];
  await pg.mouse.move(...P(100, 100)); await pg.mouse.down(); await pg.mouse.move(...P(500, 300), { steps: 5 });
  const preview = await fr.evaluate(() => { const o = document.getElementById("ov").getContext("2d"); return [o.getImageData(50, 50, 1, 1).data[3], o.getImageData(300, 200, 1, 1).data[3]]; });
  ok(preview[0] > 0 && preview[1] === 0, "drag preview dims outside and keeps the selection clear");
  await pg.mouse.up(); await pg.waitForTimeout(100);
  { const m = (await st(fr)).match(/^Mosaic applied (\d+)×(\d+)$/); ok(m && Math.abs(m[1] - 400) <= 2 && Math.abs(m[2] - 200) <= 2, "drag applies mark with size: " + (await st(fr))); }
  await pg.mouse.move(...P(10, 10)); await pg.mouse.down(); await pg.mouse.up();
  ok((await st(fr)) === "Area too small, cancelled", "tiny drag is ignored");
  await pg.close();

  // 2b. colour picker + mosaic strength change the result
  [pg, fr] = await open();
  await fr.setInputFiles("#file", big); await fr.waitForFunction(() => /Loaded/.test(document.getElementById("st").textContent));
  await fr.click('[data-tool="rect"]'); await fr.fill("#color", "#00ff00");
  const bx2 = await (await fr.$("#ov")).boundingBox(); const k2 = bx2.width / 1600; const Q = (x, y) => [bx2.x + x * k2, bx2.y + y * k2];
  await pg.mouse.move(...Q(100, 100)); await pg.mouse.down(); await pg.mouse.move(...Q(300, 300), { steps: 3 }); await pg.mouse.up();
  ok(await fr.evaluate(() => [...document.getElementById("cv").getContext("2d").getImageData(100, 200, 1, 1).data].slice(0, 3).join()) === "0,255,0", "colour picker sets drawn colour");
  const blockRun = async (lvl) => { await fr.click("#undo"); await fr.click('[data-tool="mosaic"]'); await fr.fill("#strength", String(lvl));
    // the toolbar can re-wrap when controls swap, so re-measure the canvas
    const b3 = await (await fr.$("#ov")).boundingBox(); const k3 = b3.width / 1600; const Q = (x, y) => [b3.x + x * k3, b3.y + y * k3];
    await pg.mouse.move(...Q(0, 0)); await pg.mouse.down(); await pg.mouse.move(...Q(800, 50), { steps: 3 }); await pg.mouse.up();
    // count colour changes along a row: fewer changes = bigger blocks
    return fr.evaluate(() => { const d = document.getElementById("cv").getContext("2d").getImageData(0, 10, 800, 1).data; let n = 0; for (let i = 4; i < d.length; i += 4) if (d[i] !== d[i - 4]) n++; return n; }); };
  const weak = await blockRun(1), strong = await blockRun(5);
  ok(strong < weak, `higher mosaic strength makes bigger blocks (${weak} -> ${strong} edges)`);
  await pg.close();

  // 3. i18n + theme
  [pg, fr] = await open({ locale: "ko-KR", colorScheme: "dark" });
  const s = () => fr.evaluate(() => [document.documentElement.lang, document.documentElement.dataset.theme, document.querySelector('[data-tool="mosaic"]').textContent].join(" "));
  ok((await s()) === "ko dark 모자이크", "follows system language and dark mode");
  ok((await fr.textContent("#undo")) === "되돌리기", "undo label (ko)");
  await fr.click("#lang"); await fr.click("#theme");
  ok((await s()) === "en light Mosaic", "toggles switch language and theme");
  await pg.evaluate(() => bridge.sendHostContextChange({ theme: "dark", locale: "ko-KR" })); await pg.waitForTimeout(150);
  ok((await s()) === "en light Mosaic", "manual choice is kept when the host changes");
  await pg.close();
  [pg, fr] = await open();
  await pg.evaluate(() => bridge.sendHostContextChange({ theme: "dark", locale: "ko-KR" })); await pg.waitForTimeout(150);
  ok((await s()) === "ko dark 모자이크", "follows host theme and locale without a manual choice");

  await b.close(); srv.close();
  console.log(failures ? `${failures} failed` : "all passed"); process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
