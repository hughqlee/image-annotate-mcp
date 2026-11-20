import { build } from "esbuild";
import fs from "node:fs";
const r = await build({ entryPoints: ["src/ui.js"], bundle: true, format: "esm", minify: true, write: false });
const js = r.outputFiles[0].text.replace(/<\/script/g, "<\\/script");
const html = fs.readFileSync("src/ui.html", "utf8").replace("/*BUNDLE*/", () => js);
fs.mkdirSync("lib", { recursive: true });
fs.writeFileSync("lib/ui-html.js", "export default " + JSON.stringify(html) + ";\n");
fs.mkdirSync("public", { recursive: true });
// Public pages (guide, privacy, terms, icon) for the directory listings: site/ -> public/.
fs.cpSync("site", "public", { recursive: true });
fs.copyFileSync("docs/listing/1.png", "public/screenshot.png");
// ChatGPT app review checks domain ownership at this path; the token comes from the OpenAI portal.
if (process.env.OPENAI_APPS_CHALLENGE) {
  fs.mkdirSync("public/.well-known", { recursive: true });
  fs.writeFileSync("public/.well-known/openai-apps-challenge", process.env.OPENAI_APPS_CHALLENGE.trim());
}
console.log("ui html bytes", html.length);
