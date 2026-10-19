import usernameData from "./catalog-data.json";
import emailData from "./email-data.json";
import type { Platform, SearchMode, SearchResult } from "./types";

export type SiteRule = { id: string; name: string; cat: string; uri_check: string; uri_pretty?: string; e_code: number; e_string: string; m_code: number; m_string: string; method?: string; post_body?: unknown; headers?: Record<string, string> | null; input_operation?: string | null; pre_check?: unknown; strip_bad_char?: string };
const usernameRules = usernameData.sites as SiteRule[];
const emailRules = emailData.sites.map((s, i) => ({ ...s, id: `e${i}` })) as SiteRule[];
const popularNames = new Set(["GitHub (User)", "GitLab", "Bluesky Username", "Instagram", "Reddit", "TikTok", "YouTube User2", "Pinterest", "Steam", "SoundCloud", "Vimeo", "Twitch", "Medium", "dev.to", "Keybase", "Replit", "Hacker News", "HackerRank", "HuggingFace", "Flickr", "Behance", "Dribbble", "Patreon", "Linktree"]);
export const MAX_BATCH = 6;
export const CATALOG_DATE = "2026-10-19";
export function rulesFor(mode: SearchMode): SiteRule[] { return mode === "email" ? emailRules : usernameRules; }
export function canAutomate(site: SiteRule): boolean { return site.uri_check.startsWith("https://") && !site.post_body && (!site.method || site.method === "GET") && !site.pre_check; }
export function catalogFor(mode: SearchMode): Platform[] { return rulesFor(mode).map(s => ({ id: s.id, name: s.name, category: s.cat, automated: canAutomate(s), popular: popularNames.has(s.name) })); }
export function validateQuery(value: unknown, mode: SearchMode): string {
  if (typeof value !== "string") throw new Error("Enter a username or email address.");
  const text = value.trim();
  if (mode === "email") { if (text.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text)) throw new Error("Enter a complete email address."); return text.toLowerCase(); }
  const username = text.replace(/^@/, "");
  if (!/^[\p{L}\p{N}_. -]{1,64}$/u.test(username)) throw new Error("Use 1–64 letters, numbers, spaces, dots, underscores or hyphens. Enter a handle, not a profile URL.");
  return username;
}
export function isPublicUrl(value: string): boolean {
  try { const u = new URL(value); const host = u.hostname.toLowerCase(); return u.protocol === "https:" && !u.username && !u.password && (!u.port || u.port === "443") && host.includes(".") && !/^[\d.]+$/.test(host) && !host.includes(":") && !/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) && !host.endsWith(".localhost") && !host.endsWith(".local") && !host.endsWith(".internal") && !["metadata.google.internal", "metadata.google", "instance-data.ec2.internal"].includes(host); } catch { return false; }
}
const challengePattern = /cf-chl-|challenge-platform|verify (?:that )?you are human|checking your browser before|<title>just a moment|access to this page has been denied|our systems have detected unusual traffic/i;
export function classifyResponse(site: SiteRule, code: number, body: string, redirectedToLogin = false): Pick<SearchResult, "status" | "detail"> {
  if ([401, 403, 407, 429].includes(code) || challengePattern.test(body) || redirectedToLogin) return { status: "blocked", detail: code === 429 ? "The platform rate-limited this check. Try again later." : "A sign-in or bot challenge prevented verification." };
  if (code >= 500) return { status: "error", detail: "The platform returned a server error." };
  const foundMarker = !site.e_string || body.includes(site.e_string);
  const missingMarker = !!site.m_string && body.includes(site.m_string);
  if (missingMarker || (code === site.m_code && site.m_code !== site.e_code)) return { status: "not_found", detail: "The platform returned its configured account-missing response." };
  if (code === site.e_code && foundMarker) return { status: "found", detail: "The response matched the account-exists rule. Verify the profile before attributing it to a person." };
  return { status: "unknown", detail: "The response did not match either detection rule. This is not proof that an account is absent." };
}
async function limitedText(response: Response, maxBytes = 768 * 1024): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let size = 0; let content = "";
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) { content += decoder.decode(value.slice(0, Math.max(0, value.length - (size - maxBytes))), { stream: true }); await reader.cancel(); break; } content += decoder.decode(value, { stream: true }); } } finally { reader.releaseLock(); }
  return content + decoder.decode();
}
async function accountInput(query: string, site: SiteRule): Promise<string> {
  if (site.input_operation === "hash-sha256") { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(query)); return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join(""); }
  return query;
}
export async function checkPlatform(site: SiteRule, query: string, mode: SearchMode, requestSignal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<SearchResult> {
  const start = Date.now(); const base = { id: site.id, name: site.name, category: site.cat, checkedAt: new Date().toISOString() };
  if (!canAutomate(site)) return { ...base, status: "manual", detail: "This entry requires an unsupported request method, credentials, or HTTP. It was not contacted.", url: null, elapsedMs: 0 };
  const account = await accountInput(query, site); const encoded = encodeURIComponent(account);
  let url = site.uri_check.replaceAll("{account}", encoded);
  const target = site.uri_pretty?.replaceAll("{account}", encoded) || (mode === "username" && !/[?]|\/api\/|\.json(?:$|\?)/.test(url) ? url : null);
  const profileUrl = target && isPublicUrl(target) ? target : null;
  if (!isPublicUrl(url)) return { ...base, status: "manual", detail: "The destination does not support a safe public HTTPS check.", url: profileUrl, elapsedMs: 0 };
  const timeout = AbortSignal.timeout(9000); const signal = requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout;
  try {
    let response: Response | null = null; let login = false;
    for (let hop = 0; hop <= 4; hop++) {
      const headers: Record<string, string> = { "User-Agent": "Blackbird-Mobile/1.0 (public-profile-check)", "Accept": "text/html,application/json;q=0.9,*/*;q=0.5" };
      for (const [key, value] of Object.entries(site.headers || {})) if (/^(accept|content-type|x-requested-with)$/i.test(key)) headers[key] = value;
      response = await fetcher(url, { method: "GET", redirect: "manual", signal, headers });
      if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
        const next = new URL(response.headers.get("location")!, url); await response.body?.cancel();
        if (!isPublicUrl(next.href)) throw new Error("Unsafe redirect blocked");
        if (/\/(?:login|signin|sign-in|auth)(?:\/|\?|$)/i.test(next.pathname)) { login = true; break; }
        url = next.href; if (hop === 4) throw new Error("Too many redirects");
      } else break;
    }
    if (!response) throw new Error("No response");
    const body = login ? "" : await limitedText(response); const classification = classifyResponse(site, response.status, body, login);
    let resultUrl = profileUrl;
    if (mode === "email" && site.name === "Gravatar" && classification.status === "found") { try { const entry = JSON.parse(body).entry?.[0]; if (entry?.profileUrl && isPublicUrl(entry.profileUrl)) resultUrl = entry.profileUrl; } catch {} }
    return { ...base, ...classification, url: resultUrl, httpStatus: response.status, elapsedMs: Date.now() - start };
  } catch (error) {
    return { ...base, status: "error", detail: signal.aborted ? "The check timed out or was cancelled. You can retry it." : error instanceof Error && error.message === "Unsafe redirect blocked" ? "An unsafe redirect was blocked." : "The platform could not be reached. You can retry it.", url: profileUrl, elapsedMs: Date.now() - start };
  }
}
