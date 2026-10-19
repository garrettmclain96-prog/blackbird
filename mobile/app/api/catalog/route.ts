import { catalogFor, CATALOG_DATE } from "@/lib/engine";
export async function GET() { return Response.json({ username: catalogFor("username"), email: catalogFor("email"), updated: CATALOG_DATE, source: "Blackbird / WhatsMyName" }, { headers: { "Cache-Control": "private, max-age=3600" } }); }
