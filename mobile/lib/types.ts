export type SearchMode = "username" | "email";
export type ResultStatus = "found" | "not_found" | "blocked" | "unknown" | "error" | "manual";
export type Platform = { id: string; name: string; category: string; automated: boolean; popular: boolean };
export type SearchResult = { id: string; name: string; category: string; status: ResultStatus; detail: string; url: string | null; httpStatus?: number; elapsedMs: number; checkedAt: string };
export type SearchRun = { id: string; mode: SearchMode; query: string; siteIds: string[]; results: SearchResult[]; status: "running" | "paused" | "completed"; startedAt: string; updatedAt: string };
