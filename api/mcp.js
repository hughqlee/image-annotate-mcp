import { handler } from "../lib/server.js";
const h = (req) => handler.fetch(req);
export const GET = h, POST = h, DELETE = h, OPTIONS = h;
