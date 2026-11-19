// Renders the directory listing screenshots (docs/listing/*.png, PNG, 2000px wide, app area only).
// Usage: npm run build && node test/listing-shots.cjs
const { chromium } = require("playwright"); const http = require("http"); const fs = require("fs"); const path = require("path");
const { buildSync } = require("esbuild");
const out = path.join(__dirname, ".build"); fs.mkdirSync(out, { recursive: true });
const dest = path.join(__dirname, "../docs/listing"); fs.mkdirSync(dest, { recursive: true });
buildSync({ entryPoints: [path.join(__dirname, "host.js")], bundle: true, format: "iife", outfile: path.join(out, "host.js"), logLevel: "warning" });
fs.writeFileSync(path.join(out, "host.html"), '<!doctype html><html><body><script src="host.js"></script></body></html>');

// A made-up checkout screen to annotate (fictional data).
const SAMPLE = `<html><body style="margin:0;width:1200px;height:530px;font:22px system-ui,sans-serif;background:#f6f8fa;color:#1f2328">
<div style="background:#24292f;color:#fff;padding:18px 32px;font-weight:600">Example Shop · Checkout</div>
<div style="margin:28px 32px;background:#fff;border:1px solid #d1d9e0;border-radius:10px;padding:24px 32px">
<div id="err" style="background:#ffebe9;border:1px solid #ff8182;color:#82071e;border-radius:8px;padding:12px 16px;margin-bottom:22px">Payment failed: the card has expired.</div>
<table style="border-collapse:collapse;width:100%;font-size:22px">
<tr><td style="padding:10px 0;color:#59636e;width:220px">Name</td><td>Jamie Rivera</td></tr>
<tr><td style="padding:10px 0;color:#59636e">Email</td><td><span id="email">jamie.rivera@example.com</span></td></tr>
<tr><td style="padding:10px 0;color:#59636e">Card</td><td><span id="card">4242 4242 4242 4242 · exp 08/25</span></td></tr>
<tr><td style="padding:10px 0;color:#59636e">Ship to</td><td>12 Sample Street, Springfield</td></tr>
<tr id="total"><td style="padding:16px 0 0;font-weight:700">Total</td><td style="padding-top:16px;font-weight:700">$128.40</td></tr></table>
<div id="pay" style="margin-top:22px;display:inline-block;background:#1f883d;color:#fff;padding:12px 28px;border-radius:8px;font-weight:600">Pay now</div>
</div></body></html>`;

(async () => {
  const ui = (await import(path.join(__dirname, "../lib/ui-html.js"))).default;
  const srv = http.createServer((q, r) => { const f = path.join(out, q.url.split("?")[0]); fs.existsSync(f) ? r.end(fs.readFileSync(f)) : (r.statusCode = 404, r.end()); }).listen(0);
  const b = await chromium.launch();
  let R; // element rects in image pixels
  { const p = await b.newPage({ viewport: { width: 1200, height: 530 } }); await p.setContent(SAMPLE); await p.screenshot({ path: path.join(out, "sample.png") }); fs.copyFileSync(path.join(out, "sample.png"), path.join(__dirname, "../site/sample.png")); // reviewers paste this one
    R = await p.evaluate(() => Object.fromEntries(["err", "email", "card", "total", "pay"].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [id, { x: r.x, y: r.y, w: r.width, h: r.height }]; }))); await p.close(); }
  const pad = (r, p = 8) => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });
  const W = 1000, H = 520;
  const open = async (scheme = "light", locale = "en-US") => {
    const pg = await b.newPage({ viewport: { width: W + 20, height: H + 20 }, colorScheme: scheme, locale, deviceScaleFactor: 2 });
    await pg.goto(`http://localhost:${srv.address().port}/host.html`); await pg.evaluate(h => startHost(h), ui);
    await pg.evaluate(([w, h]) => { const f = document.querySelector("iframe"); f.style.cssText = `width:${w}px;height:${h}px;border:0`; document.body.style.margin = "10px"; }, [W, H]);
    const fr = pg.frames()[1]; await fr.waitForFunction(() => /Ready|준비됨/.test(document.getElementById("st").textContent));
    await fr.setInputFiles("#file", path.join(out, "sample.png")); await fr.waitForFunction(() => /Loaded|불러옴/.test(document.getElementById("st").textContent));
    return [pg, fr];
  };
  const marks = (pg, m) => pg.evaluate(m => bridge.sendToolResult({ content: [], structuredContent: { marks: m } }), m);
  const shot = async (pg, name) => { await pg.waitForTimeout(250); const h = await pg.evaluate(() => Math.ceil(document.querySelector("iframe").contentDocument.getElementById("wrap").getBoundingClientRect().bottom) + 8);
    await pg.screenshot({ path: path.join(dest, name), clip: { x: 10, y: 10, width: W, height: Math.min(H, h) } }); await pg.close(); };
  // 1. agent marks: red box on the error, highlight on the total, check on the button
  let [pg] = await open();
  await marks(pg, [{ type: "rect", ...pad(R.err), color: "#e11d1d" }, { type: "highlight", ...pad({ ...R.total, w: 330 }, 2) }, { type: "check", x: R.pay.x + R.pay.w + 20, y: R.pay.y - 4, w: 56, h: R.pay.h + 8, color: "#1a7f37" }]);
  await shot(pg, "1.png");
  // 2. hide personal data: mosaic the email, redact the card number
  [pg] = await open();
  await marks(pg, [{ type: "mosaic", ...pad(R.email, 4), strength: 2 }, { type: "redact", ...pad(R.card, 4) }]);
  await shot(pg, "2.png");
  // 3. drag preview while the user selects an area by hand
  let fr; [pg, fr] = await open();
  await fr.click('[data-tool="highlight"]');
  const bx = await (await fr.$("#ov")).boundingBox(); const k = bx.width / 1200; const fo = await (await pg.$("iframe")).boundingBox();
  const P = (x, y) => [fo.x + bx.x + x * k, fo.y + bx.y + y * k];
  const T = pad({ ...R.total, w: 330 }, 4); await pg.mouse.move(...P(T.x, T.y)); await pg.mouse.down(); await pg.mouse.move(...P(T.x + T.w, T.y + T.h), { steps: 6 });
  await shot(pg, "3.png");
  // 4. Korean + dark theme
  [pg] = await open("dark", "ko-KR");
  await marks(pg, [{ type: "rect", ...pad(R.err) }, { type: "mosaic", ...pad(R.email, 4), strength: 2 }, { type: "redact", ...pad(R.card, 4) }]);
  await shot(pg, "4.png");
  await b.close(); srv.close();
  console.log("wrote", fs.readdirSync(dest).join(", "));
})().catch(e => { console.error(e); process.exit(1); });
