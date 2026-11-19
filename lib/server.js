import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import html from "./ui-html.js";
const URI = "ui://annotate/app.html";
const Mark = z.object({
  type: z.enum(["highlight", "rect", "check", "mosaic"]).describe("highlight=translucent yellow fill, rect=red box outline, check=green check mark, mosaic=pixelate to hide"),
  x: z.number(), y: z.number(), w: z.number(), h: z.number(),
});
function factory() {
  const s = new McpServer({ name: "annotate-test", version: "0.1.0" });
  registerAppResource(s, "Annotator", URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{ uri: URI, mimeType: RESOURCE_MIME_TYPE, text: html }],
  }));
  registerAppTool(s, "open_annotator", {
    title: "Open image annotator",
    description: "Open an annotator where the user pastes (Ctrl+V), drops or picks a screenshot and marks it with highlight, box, check mark or mosaic. When the user loads an image, it is shared with you; then call apply_marks with pixel coordinates.",
    inputSchema: z.object({}),
    _meta: { ui: { resourceUri: URI } },
  }, async () => ({ content: [{ type: "text", text: "Annotator opened. Ask the user to paste, drop or pick an image in it." }] }));
  registerAppTool(s, "apply_marks", {
    title: "Apply marks to the image",
    description: "Draw marks on the image the user loaded in the annotator. Coordinates are image pixels, origin top-left.",
    inputSchema: z.object({ marks: z.array(Mark).min(1) }),
    _meta: { ui: { resourceUri: URI } },
  }, async ({ marks }) => ({
    content: [{ type: "text", text: `Applied ${marks.length} mark(s).` }],
    structuredContent: { marks },
  }));
  return s;
}
export const handler = createMcpHandler(factory);
