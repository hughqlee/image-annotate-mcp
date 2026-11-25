import { App } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
const app = new App({ name: "annotate-proto", version: "0.2.0" });
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { willReadFrequently: true });
let loaded = false, tool = "rect", undo = [], start = null;

// ---------- i18n + theme ----------
const T = {
  en: { open: "Open image", highlight: "Highlight", rect: "Box", check: "Check", mosaic: "Mosaic", redact: "Redact", undo: "Undo", export: "Export", fit: "Fit", color: "Colour", strength: "Strength",
        hint: "Paste (Ctrl+V), drop, or open an image", connected: "Ready", loaded: (w, h) => `Loaded ${w}×${h}`,
        selected: n => `${n}: drag to select an area`, applied: (n, w, h) => `${n} applied ${w}×${h}`, tooSmall: "Area too small, cancelled",
        cancelled: "Drag cancelled", agent: "Applied marks from Claude", agentRestored: "Applied marks from Claude (image restored)",
        live: "Applied live marks", exported: "Exported",
        useBelow: "Save from the panel below", outTitle: "Your image", outHint: "Right-click (or long-press) the image to save or copy it.", outWhy: r => `Direct download unavailable (${r}).`,
        denied: "cancelled or blocked", noDownload: "not supported here", copy: "Copy image", send: "Send to chat", close: "Close",
        copied: "Copied to clipboard", copyFailed: "Copy blocked: right-click the image instead", sent: "Sent to chat", sentText: "Here is my annotated image from the annotator. Please take a look.", resized: (w, h) => `Large image scaled to ${w}×${h}`, failed: m => `Failed: ${m}`, light: "☀ Light", dark: "☾ Dark", langBtn: "한국어" },
  ko: { open: "이미지 열기", highlight: "하이라이트", rect: "네모", check: "체크", mosaic: "모자이크", redact: "가리기", undo: "되돌리기", export: "내보내기", fit: "맞춤", color: "색상", strength: "강도",
        hint: "이미지를 붙여넣기(Ctrl+V), 드래그하거나 열어 주세요", connected: "준비됨", loaded: (w, h) => `불러옴 ${w}×${h}`,
        selected: n => `${n}: 드래그로 영역 지정`, applied: (n, w, h) => `${n} 적용 ${w}×${h}`, tooSmall: "영역이 너무 작아 취소됨",
        cancelled: "드래그 취소", agent: "Claude 표시 적용", agentRestored: "Claude 표시 적용 (이미지 복원)",
        live: "실시간 표시 적용", exported: "내보냄",
        useBelow: "아래 창에서 저장하세요", outTitle: "완성된 이미지", outHint: "이미지를 우클릭(모바일은 길게 누르기)해서 저장하거나 복사하세요.", outWhy: r => `바로 다운로드할 수 없습니다 (${r}).`,
        denied: "취소되었거나 차단됨", noDownload: "이 앱에서 지원 안 함", copy: "이미지 복사", send: "채팅으로 보내기", close: "닫기",
        copied: "클립보드에 복사됨", copyFailed: "복사가 막혔습니다. 이미지를 우클릭하세요", sent: "채팅으로 보냄", sentText: "주석 앱에서 표시한 이미지를 공유했어요. 확인해 주세요.", resized: (w, h) => `큰 이미지를 ${w}×${h}로 줄임`, failed: m => `실패: ${m}`, light: "☀ 라이트", dark: "☾ 다크", langBtn: "English" },
};
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const sysDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
let lang = store.get("annot:lang") || ((navigator.language || "en").startsWith("ko") ? "ko" : "en");
let theme = store.get("annot:theme") || (sysDark() ? "dark" : "light");
let lastStatus = ["hint0"];
const t = (k, ...a) => { const v = T[lang][k]; return typeof v === "function" ? v(...a) : v; };
const log = (k, ...a) => { lastStatus = [k, ...a]; $("st").textContent = k === "hint0" ? "" : (k in T[lang] ? t(k, ...a) : k); };
function render() {
  document.documentElement.lang = lang;
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-i18n]").forEach(el => el.textContent = t(el.dataset.i18n));
  $("lang").textContent = t("langBtn");
  $("theme").textContent = theme === "dark" ? t("light") : t("dark"); // button shows the mode it switches to
  $("theme").title = theme === "dark" ? "Switch to light" : "Switch to dark";
  $("hint").hidden = loaded;
  log(...lastStatus);
}
$("lang").onclick = () => { lang = lang === "ko" ? "en" : "ko"; store.set("annot:lang", lang); render(); };
$("theme").onclick = () => { theme = theme === "dark" ? "light" : "dark"; store.set("annot:theme", theme); render(); };
// follow the host (Claude/ChatGPT) unless the user has toggled manually
function applyHost(hc) {
  if (!hc) return;
  if (hc.theme && !store.get("annot:theme")) theme = hc.theme === "dark" ? "dark" : "light";
  if (hc.locale && !store.get("annot:lang")) lang = hc.locale.toLowerCase().startsWith("ko") ? "ko" : "en";
  render();
}
app.onhostcontextchanged = applyHost;

// ---------- tools ----------
const toolBtns = document.querySelectorAll("[data-tool]");
// per-tool colour, remembered for the session; mosaic has no colour, it has strength
const HEX = /^#[0-9a-f]{6}$/i;
const toolColor = { highlight: "#ffe600", rect: "#e11d1d", check: "#1aaa1a", mosaic: "#1f6feb", redact: "#000000" };
const colorIn = $("color"), strengthIn = $("strength");
function syncToolControls() {
  const isMosaic = tool === "mosaic";
  $("colorBox").hidden = isMosaic; $("strengthBox").hidden = !isMosaic;
  colorIn.value = toolColor[tool];
}
colorIn.oninput = () => { if (HEX.test(colorIn.value)) toolColor[tool] = colorIn.value; };
toolBtns.forEach(b => b.onclick = () => { tool = b.dataset.tool; toolBtns.forEach(x => x.setAttribute("aria-pressed", String(x === b))); syncToolControls(); log("selected", t(tool)); });
syncToolControls();
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

// ---------- image in ----------
function loadBlob(blob) {
  // blob: URLs are blocked by the default MCP Apps CSP (img-src 'self' data:), so decode directly
  createImageBitmap(blob).then(async (img) => {
    // cap very large images (memory + canvas limits); 24 MP keeps 4K/5K screenshots at full size
    const MAX_PX = 24e6, f = Math.min(1, Math.sqrt(MAX_PX / (img.width * img.height)));
    cv.width = Math.max(1, Math.round(img.width * f)); cv.height = Math.max(1, Math.round(img.height * f));
    ctx.drawImage(img, 0, 0, cv.width, cv.height); setZoom(null); undo = []; loaded = true; save(); clearOverlay(); render();
    f < 1 ? log("resized", cv.width, cv.height) : log("loaded", cv.width, cv.height);
    const data = cv.toDataURL("image/png").split(",")[1];
    try {
      await app.updateModelContext({ content: [
        { type: "image", data, mimeType: "image/png" },
        { type: "text", text: `User loaded an image ${cv.width}x${cv.height}px into the annotator. Pixel coords, origin top-left.` } ] });
    } catch (e) { log("failed", e.message); }
  }).catch(e => log("failed", e.message));
}
// Test: does a later widget instance of the same server see the earlier image?
// Privacy: this copy may still be unredacted, so it expires after 30 minutes and is wiped on export.
const KEEP_MS = 30 * 60 * 1000;
function save() { try { localStorage.setItem("annot:last", cv.toDataURL("image/png")); localStorage.setItem("annot:lastAt", String(Date.now())); } catch (e) {} }
function forget() { try { localStorage.removeItem("annot:last"); localStorage.removeItem("annot:lastAt"); } catch (e) {} }
if (Date.now() - Number(store.get("annot:lastAt") || 0) > KEEP_MS) forget();
async function restore() {
  if (Date.now() - Number(store.get("annot:lastAt") || 0) > KEEP_MS) { forget(); return false; }
  const d = store.get("annot:last"); if (!d) return false;
  const bin = atob(d.split(",")[1]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const img = await createImageBitmap(new Blob([u], { type: "image/png" })); cv.width = img.width; cv.height = img.height; ctx.drawImage(img, 0, 0); return true;
}
$("file").onchange = e => e.target.files[0] && loadBlob(e.target.files[0]);
document.addEventListener("paste", e => { const f = [...(e.clipboardData?.files || [])][0]; if (f) loadBlob(f); });
document.addEventListener("dragover", e => e.preventDefault());
document.addEventListener("drop", e => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) loadBlob(f); });

// ---------- marks ----------
// mosaic strength 1..5 -> blocks per long side (fewer blocks = bigger blocks = stronger)
const BLOCKS = [120, 80, 55, 35, 20];
const UNDO_BYTES = 256 * 1024 * 1024; // keep undo history under ~256 MB
export function applyMark(m) {
  if (!["highlight", "rect", "check", "mosaic", "redact"].includes(m.type)) return;
  const nums = [m.x, m.y, m.w, m.h];
  if (!nums.every(Number.isFinite)) return;
  undo.push(ctx.getImageData(0, 0, cv.width, cv.height));
  while (undo.length > 1 && undo.length * cv.width * cv.height * 4 > UNDO_BYTES) undo.shift();
  const { x, y, w, h } = m;
  const col = HEX.test(m.color || "") ? m.color : toolColor[m.type];
  if (m.type === "rect") { ctx.lineWidth = Math.max(3, cv.width / 300); ctx.strokeStyle = col; ctx.strokeRect(x, y, w, h); }
  else if (m.type === "highlight") { ctx.fillStyle = rgba(col, 0.4); ctx.fillRect(x, y, w, h); }
  else if (m.type === "redact") { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); } // fully opaque: nothing underneath survives export
  else if (m.type === "check") { ctx.lineWidth = Math.max(5, cv.width / 200); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = col; ctx.beginPath();
    ctx.moveTo(x, y + h * 0.55); ctx.lineTo(x + w * 0.4, y + h); ctx.lineTo(x + w, y); ctx.stroke(); }
  else if (m.type === "mosaic") {
    // block size scales with the image so text stays unreadable on large screenshots; each block = average colour
    const lvl = Math.min(5, Math.max(1, Math.round(m.strength || 3)));
    const s = Math.max(6, Math.round(Math.max(cv.width, cv.height) / BLOCKS[lvl - 1]));
    const X = Math.max(0, Math.floor(x)), Y = Math.max(0, Math.floor(y)), W = Math.min(cv.width - X, Math.ceil(w)), H = Math.min(cv.height - Y, Math.ceil(h));
    if (W < 1 || H < 1) return;
    const img = ctx.getImageData(X, Y, W, H), d = img.data;
    for (let by = 0; by < H; by += s) for (let bx = 0; bx < W; bx += s) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = by; yy < Math.min(by + s, H); yy++) for (let xx = bx; xx < Math.min(bx + s, W); xx++) { const o = (yy * W + xx) * 4; r += d[o]; g += d[o + 1]; b += d[o + 2]; n++; }
      ctx.fillStyle = `rgb(${r / n | 0},${g / n | 0},${b / n | 0})`; ctx.fillRect(X + bx, Y + by, Math.min(s, W - bx), Math.min(s, H - by)); } }
  save();
}
window.applyMark = applyMark;
$("undo").onclick = () => { const d = undo.pop(); if (d) { ctx.putImageData(d, 0, 0); save(); } };

// ---------- drag with live preview (overlay canvas, never baked into the image) ----------
const ov = $("ov"), octx = ov.getContext("2d");
const clamp = (v, max) => Math.max(0, Math.min(max, v));
const pt = e => { const r = cv.getBoundingClientRect(); return [clamp((e.clientX - r.left) * cv.width / r.width, cv.width), clamp((e.clientY - r.top) * cv.height / r.height, cv.height)]; };
const scale = () => cv.width / cv.getBoundingClientRect().width || 1; // image px per screen px
function clearOverlay() { if (ov.width !== cv.width || ov.height !== cv.height) { ov.width = cv.width; ov.height = cv.height; } octx.clearRect(0, 0, ov.width, ov.height); }
function drawPreview(a, b, c, d) {
  clearOverlay();
  const k = scale(), x = Math.min(a, c), y = Math.min(b, d), w = Math.abs(c - a), h = Math.abs(d - b), col = toolColor[tool];
  octx.fillStyle = "rgba(0,0,0,0.35)"; octx.fillRect(0, 0, ov.width, ov.height); octx.clearRect(x, y, w, h); // dim outside
  if (tool === "highlight") { octx.fillStyle = rgba(col, 0.4); octx.fillRect(x, y, w, h); }
  if (tool === "redact") { octx.fillStyle = rgba(col, 0.6); octx.fillRect(x, y, w, h); }
  octx.lineWidth = 2 * k; octx.strokeStyle = "#fff"; octx.strokeRect(x, y, w, h);
  octx.setLineDash([6 * k, 4 * k]); octx.strokeStyle = col; octx.strokeRect(x, y, w, h); octx.setLineDash([]);
  const dot = (px, py, r) => { octx.beginPath(); octx.arc(px, py, r * k, 0, 7); octx.fillStyle = "#fff"; octx.fill(); octx.beginPath(); octx.arc(px, py, (r - 2) * k, 0, 7); octx.fillStyle = col; octx.fill(); };
  octx.lineWidth = k; octx.strokeStyle = col; octx.beginPath(); octx.moveTo(a - 12 * k, b); octx.lineTo(a + 12 * k, b); octx.moveTo(a, b - 12 * k); octx.lineTo(a, b + 12 * k); octx.stroke();
  dot(a, b, 6); dot(c, d, 5);
  const label = `${t(tool)} ${Math.round(w)}×${Math.round(h)}`;
  octx.font = `${13 * k}px system-ui,sans-serif`; const tw = octx.measureText(label).width + 10 * k, th = 20 * k;
  let lx = c + 10 * k, ly = d + 10 * k; if (lx + tw > ov.width) lx = c - tw - 10 * k; if (ly + th > ov.height) ly = d - th - 10 * k;
  octx.fillStyle = "rgba(0,0,0,0.75)"; octx.fillRect(lx, ly, tw, th); octx.fillStyle = "#fff"; octx.fillText(label, lx + 5 * k, ly + 14 * k);
}
ov.onpointerdown = e => { if (e.button !== 0 || !loaded) return; ov.setPointerCapture(e.pointerId); start = pt(e); drawPreview(...start, ...start); };
ov.onpointermove = e => { if (start) drawPreview(...start, ...pt(e)); };
const endDrag = (e, commit) => { if (!start) return; const [a, b] = start, [c, d] = commit ? pt(e) : start; start = null; clearOverlay();
  const w = Math.abs(c - a), h = Math.abs(d - b);
  if (!commit) return; if (w < 3 || h < 3) return log("tooSmall");
  applyMark({ type: tool, x: Math.min(a, c), y: Math.min(b, d), w, h, color: toolColor[tool], strength: +strengthIn.value }); log("applied", t(tool), Math.round(w), Math.round(h)); };
ov.onpointerup = e => endDrag(e, true);
ov.onpointercancel = e => endDrag(e, false);
document.addEventListener("keydown", e => { if (e.key === "Escape" && start) { endDrag(e, false); log("cancelled"); } });

// ---------- agent ----------
const MarkZ = z.object({ type: z.enum(["highlight", "rect", "check", "mosaic", "redact"]), x: z.number().finite(), y: z.number().finite(), w: z.number().finite().min(0), h: z.number().finite().min(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), strength: z.number().int().min(1).max(5).optional() });
app.registerTool("apply_marks_live", { description: "Draw marks on the image currently open in this annotator window (pixel coords).", inputSchema: z.object({ marks: z.array(MarkZ).max(200) }) },
  async ({ marks }) => { marks.forEach(applyMark); log("live"); return { content: [{ type: "text", text: `applied ${marks.length}` }] }; });
let restored = null;
app.ontoolresult = async p => { const marks = p.structuredContent?.marks || []; if (!marks.length) return;
  if (!loaded && restored === null) { restored = await restore(); loaded = restored; render(); }
  for (const m of marks.slice(0, 200)) applyMark(m); log(restored ? "agentRestored" : "agent"); };
// ---------- zoom (view only; never changes the image) ----------
// zoom = null means "fit to width"; otherwise screen px per image px
let zoom = null;
const view = $("view");
const shownScale = () => cv.getBoundingClientRect().width / cv.width;
function setZoom(z, anchor) {
  const before = shownScale();
  const rect = view.getBoundingClientRect();
  // image point under the anchor (default: view centre), so it stays put after zooming
  const ax = anchor ? anchor[0] - rect.left : view.clientWidth / 2, ay = anchor ? anchor[1] - rect.top : view.clientHeight / 2;
  const ix = (view.scrollLeft + ax) / before, iy = (view.scrollTop + ay) / before;
  zoom = z === null ? null : Math.min(8, Math.max(0.1, z));
  view.classList.toggle("zoomed", zoom !== null);
  cv.style.width = zoom === null ? "" : `${Math.round(cv.width * zoom)}px`;
  const after = shownScale();
  if (zoom !== null) { view.scrollLeft = ix * after - ax; view.scrollTop = iy * after - ay; }
  $("zoomPct").textContent = `${Math.round(after * 100)}%`;
}
const step = dir => setZoom(shownScale() * (dir > 0 ? 1.25 : 0.8));
$("zoomIn").onclick = () => step(1);
$("zoomOut").onclick = () => step(-1);
$("zoomFit").onclick = () => setZoom(null);
view.addEventListener("wheel", e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); setZoom(shownScale() * (e.deltaY < 0 ? 1.1 : 1 / 1.1), [e.clientX, e.clientY]); }, { passive: false });
document.addEventListener("keydown", e => { if (e.target.tagName === "INPUT") return;
  if (e.key === "+" || e.key === "=") step(1); else if (e.key === "-") step(-1); else if (e.key === "0") setZoom(null); });
new ResizeObserver(() => { $("zoomPct").textContent = `${Math.round(shownScale() * 100)}%`; }).observe(cv);

// ---------- export ----------
// 1) host download (ui/download-file) when the host supports it and it succeeds;
// 2) otherwise a result panel: the image itself (right-click / long-press to save or copy),
//    a copy button, and "send to chat" (image -> model context, text-only ui/message).
const caps = () => app.getHostCapabilities() || {};
const pngB64 = () => cv.toDataURL("image/png").split(",")[1];
function showOut(reason) {
  $("outImg").src = cv.toDataURL("image/png");
  $("outWhy").textContent = reason ? t("outWhy", reason) : "";
  $("send").hidden = !caps().message;
  $("out").hidden = false; $("out").scrollIntoView({ block: "nearest" });
}
$("export").onclick = async () => {
  if (!loaded) return;
  if (caps().downloadFile) {
    try {
      const r = await app.downloadFile({ contents: [{ type: "resource", resource: { uri: "file:///annotated.png", mimeType: "image/png", blob: pngB64() } }] });
      if (!r?.isError) { forget(); log("exported"); return; }
      showOut(t("denied"));
    } catch (e) { showOut(e.message); }
  } else showOut(t("noDownload"));
  log("useBelow");
};
$("copy").onclick = async () => {
  try {
    const blob = await new Promise(res => cv.toBlob(res, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    forget(); log("copied");
  } catch (e) { log("copyFailed"); }
};
$("send").onclick = async () => {
  try {
    // Claude's ui/message accepts text blocks only (<= 8,000 chars) and may refuse other blocks,
    // so the annotated image goes to the model context and the chat message is text only.
    await app.updateModelContext({ content: [
      { type: "image", data: pngB64(), mimeType: "image/png" },
      { type: "text", text: `Annotated result ${cv.width}x${cv.height}px (the user finished marking the image in the annotator).` } ] });
    const r = await app.sendMessage({ role: "user", content: [{ type: "text", text: t("sentText") }] });
    if (r?.isError) throw new Error("rejected");
    forget(); log("sent");
  } catch (e) { log("failed", e.message); }
};
$("closeOut").onclick = () => { $("out").hidden = true; };
render();
await app.connect();
applyHost(app.getHostContext());
log("connected");
