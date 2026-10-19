import { checkPlatform, MAX_BATCH, rulesFor, validateQuery } from "@/lib/engine";
import type { SearchMode } from "@/lib/types";
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Cross-origin scans are not accepted." }, { status: 403 });
    if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Send a JSON request." }, { status: 415 });
    if (Number(request.headers.get("content-length")) > 8192) return Response.json({ error: "Request too large." }, { status: 413 });
    const raw = await request.text(); if (raw.length > 8192) return Response.json({ error: "Request too large." }, { status: 413 });
    const payload = JSON.parse(raw); const mode: SearchMode = payload.mode === "email" ? "email" : "username"; const query = validateQuery(payload.query, mode);
    if (!Array.isArray(payload.ids) || payload.ids.length < 1 || payload.ids.length > MAX_BATCH || payload.ids.some((id: unknown) => typeof id !== "string")) throw new Error(`Choose between 1 and ${MAX_BATCH} platforms per batch.`);
    const ids = [...new Set(payload.ids as string[])]; const sites = rulesFor(mode).filter(s => ids.includes(s.id));
    if (sites.length !== ids.length) throw new Error("One or more platforms are not in the catalog.");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({ start(controller) {
      const send = (value: unknown) => { try { controller.enqueue(encoder.encode(JSON.stringify(value) + "\n")); } catch {} };
      const tasks = sites.map(async site => { const result = await checkPlatform(site, query, mode, request.signal); send({ type: "result", result }); });
      Promise.allSettled(tasks).then(() => { send({ type: "done" }); try { controller.close(); } catch {} });
    } });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid scan request." }, { status: 400 }); }
}
