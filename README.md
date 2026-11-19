# image-annotate-mcp

A tiny image annotator that runs inside AI chat apps (Claude, ChatGPT) as an [MCP App](https://github.com/modelcontextprotocol/ext-apps).
Paste a screenshot, then highlight, box, check, mosaic or redact (solid box) parts of it — by hand or by asking the agent ("mosaic the email address").

![drag preview](docs/drag-preview.png)

## How it works

- The image never leaves the browser. The user pastes (Ctrl+V), drops or picks it inside the app; the canvas does all the work.
  (MCP Apps has no standard way to hand chat attachments to an app yet, and this flow is more natural for screenshots anyway.)
- When an image is loaded, the app shares it with the model via `ui/update-model-context`.
- The agent calls `apply_marks` with pixel rectangles; the app draws them.
- Export goes through `ui/download-file` (sandboxed iframes cannot download directly).
- English / Korean and light / dark follow the host until the user toggles them.

## Tools

| Tool | Purpose |
| --- | --- |
| `open_annotator` | Opens the annotator UI |
| `apply_marks` | `{ marks: [{ type: "highlight" \| "rect" \| "check" \| "mosaic" \| "redact", x, y, w, h, color?, strength? }] }` in image pixels |

## Develop

```sh
npm install
npm test          # builds the UI, checks the MCP server, runs the browser test (needs Playwright + Chromium)
```

`npm run build` bundles `src/ui.js` into a single HTML string at `lib/ui-html.js`, which `lib/server.js` serves as `ui://annotate/app.html`.

## Deploy

Vercel: `api/mcp.js` exposes the server; `vercel.json` rewrites `/mcp` to it. Add `https://<your-deployment>/mcp` as a custom connector in Claude.

## Status

Prototype. Known open questions, to be checked in real hosts:
- Does the host show the image from `ui/update-model-context` to the model?
- Do agent marks land in the same app window, or does a new one open (the app then restores the last image from `localStorage`)?
