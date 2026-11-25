import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import html from "./ui-html.js";
const URI = "ui://annotate/app.html";
const SITE = "https://image-annotate-mcp.vercel.app";
export const INFO = {
  name: "image-annotate", title: "Image Annotate", version: "1.0.0", websiteUrl: SITE,
  icons: [{ src: `${SITE}/icon.png`, mimeType: "image/png", sizes: ["512x512"] }, { src: `${SITE}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] }],
};
// Neither tool touches anything outside the app in the user's browser.
// title is repeated inside annotations for clients that read ToolAnnotations.title (MCP 2025-03-26).
const OPENS = { title: "Open image annotator", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
// apply_marks changes the picture in the app (undoable), so it is not read-only.
const MARKS = { title: "Apply marks to the image", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
// Bounded inputs: the endpoint is public, so cap sizes to keep each call cheap.
const Coord = z.number().finite().min(-100000).max(100000);
const Size = z.number().finite().min(0).max(100000);
export const Mark = z.object({
  type: z.enum(["highlight", "rect", "check", "mosaic", "redact"]).describe("highlight=translucent fill, rect=box outline, check=check mark, mosaic=pixelate (can be partly reversed), redact=solid opaque box (use for passwords, card numbers, IDs, secrets)"),
  x: Coord, y: Coord, w: Size, h: Size,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Hex colour like #ff0000 for highlight/rect/check/redact. Omit for the default (redact defaults to black)."),
  strength: z.number().int().min(1).max(5).optional().describe("Mosaic strength 1 (light) to 5 (strongest). Default 3."),
});
function factory() {
  const s = new McpServer(INFO);
  // clipboardWrite: lets "Copy image" work when the host cannot download files
  const UI_META = { ui: { permissions: { clipboardWrite: {} } } };
  registerAppResource(s, "Annotator", URI, { mimeType: RESOURCE_MIME_TYPE, _meta: UI_META }, async () => ({
    contents: [{ uri: URI, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: UI_META }],
  }));
  registerAppTool(s, "open_annotator", {
    title: OPENS.title,
    description: "Open an annotator where the user pastes (Ctrl+V), drops or picks a screenshot and marks it with highlight, box, check mark, mosaic or redact (solid box). When the user loads an image, it is shared with you; then call apply_marks with pixel coordinates.",
    inputSchema: z.object({}),
    annotations: OPENS,
    _meta: { ui: { resourceUri: URI } },
  }, async () => ({ content: [{ type: "text", text: "Annotator opened. Ask the user to paste, drop or pick an image in it." }] }));
  registerAppTool(s, "apply_marks", {
    title: MARKS.title,
    description: "Draw marks on the image the user loaded in the annotator. Coordinates are image pixels, origin top-left.",
    inputSchema: z.object({ marks: z.array(Mark).min(1).max(200) }),
    annotations: MARKS,
    _meta: { ui: { resourceUri: URI } },
  }, async ({ marks }) => ({
    content: [{ type: "text", text: `Applied ${marks.length} mark(s).` }],
    structuredContent: { marks },
  }));
  return s;
}
// Tool calls are tiny; 256 KiB is far above any legitimate request.
export const handler = createMcpHandler(factory, { maxRequestBodySize: 256 * 1024 });
