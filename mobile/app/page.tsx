"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, AtSign, Bird, Bookmark, Check, CheckCheck, ChevronRight, FileJson, Globe2, History, Info, LoaderCircle, Mail, Pause, Play, Radar, RotateCcw, Search, Settings2, ShieldCheck, SlidersHorizontal, Smartphone, Trash2, X } from "lucide-react";
import type { Platform, SearchMode, SearchResult, SearchRun } from "@/lib/types";
import { buildCsv } from "@/lib/export";

type Catalog = { username: Platform[]; email: Platform[]; updated: string };
type Tab = "search" | "history" | "platforms" | "settings";
const NAV = [{ id: "search", label: "Search", icon: Search }, { id: "history", label: "History", icon: History }, { id: "platforms", label: "Platforms", icon: Globe2 }, { id: "settings", label: "Settings", icon: Settings2 }] as const;
const LABELS = { found: "Match", not_found: "Not found", blocked: "Blocked", unknown: "Uncertain", error: "Unavailable", manual: "Manual only" };
const STORAGE = "blackbird.mobile.v1";
const initials = (name: string) => name.replace(/\(.*?\)/g, "").trim().slice(0, 2).toUpperCase();
const displayCategory = (category: string) => category === "xx NSFW xx" ? "Adult" : category.charAt(0).toUpperCase() + category.slice(1);
const formatDate = (date: string) => new Date(date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function Home() {
  const [tab, setTab] = useState<Tab>("search");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [mode, setMode] = useState<SearchMode>("username");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"quick" | "all" | "custom">("quick");
  const [selected, setSelected] = useState<string[]>([]);
  const [run, setRun] = useState<SearchRun | null>(null);
  const [history, setHistory] = useState<SearchRun[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [resultFilter, setResultFilter] = useState("matches");
  const [resultSearch, setResultSearch] = useState("");
  const [platformSearch, setPlatformSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [online, setOnline] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const runRef = useRef<SearchRun | null>(null);
  const resultSection = useRef<HTMLElement | null>(null);

  const loadCatalog = useCallback(async () => {
    setCatalogError(false);
    try { const response = await fetch("/api/catalog"); if (!response.ok) throw new Error(); const data = await response.json() as Catalog; if (!Array.isArray(data.username)) throw new Error(); setCatalog(data); }
    catch { setCatalogError(true); }
  }, []);
  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE) || "{}");
      if (Array.isArray(state.history)) setHistory(state.history.slice(0, 20));
      if (Array.isArray(state.saved)) setSaved(state.saved);
      if (state.current?.siteIds && state.current?.results) { const restored = { ...state.current, status: state.current.status === "running" ? "paused" : state.current.status } as SearchRun; setRun(restored); runRef.current = restored; setMode(restored.mode); setQuery(restored.query); }
    } catch { /* Storage may be unavailable in private browsing. */ }
    setReady(true); setOnline(navigator.onLine);
    const on = () => setOnline(true); const off = () => { setOnline(false); controller.current?.abort(); };
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); controller.current?.abort(); };
  }, []);
  useEffect(() => { if (!ready) return; const timer = setTimeout(() => { try { localStorage.setItem(STORAGE, JSON.stringify({ history, saved, current: run })); } catch { setNotice("Browser storage is full or unavailable. Export results to keep a copy."); } }, 250); return () => clearTimeout(timer); }, [history, saved, run, ready]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 6500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { const before = () => { if (runRef.current?.status === "running") { try { const state = JSON.parse(localStorage.getItem(STORAGE) || "{}"); state.current = { ...runRef.current, status: "paused" }; localStorage.setItem(STORAGE, JSON.stringify(state)); } catch {} } }; window.addEventListener("pagehide", before); return () => window.removeEventListener("pagehide", before); }, []);

  const platforms = catalog?.[mode] || [];
  const selectedPlatforms = platforms.filter(p => scope === "all" ? true : scope === "custom" ? selected.includes(p.id) : mode === "email" ? p.automated : p.popular);
  const active = run?.status === "running";
  const found = run?.results.filter(r => r.status === "found").length || 0;
  const notFound = run?.results.filter(r => r.status === "not_found").length || 0;
  const unresolved = (run?.results.length || 0) - found - notFound;
  const percent = run ? Math.round(run.results.length / Math.max(run.siteIds.length, 1) * 100) : 0;
  const visibleResults = useMemo(() => (run?.results || []).filter(r => {
    if (resultFilter === "matches" && r.status !== "found") return false;
    if (resultFilter === "unresolved" && ["found", "not_found"].includes(r.status)) return false;
    if (resultFilter === "not_found" && r.status !== "not_found") return false;
    if (resultFilter === "saved" && !saved.includes(`${run?.id}:${r.id}`)) return false;
    return `${r.name} ${r.category}`.toLowerCase().includes(resultSearch.toLowerCase());
  }).sort((a, b) => a.name.localeCompare(b.name)), [run, resultFilter, resultSearch, saved]);
  const categories = [...new Set(platforms.map(p => p.category))].sort();
  const visiblePlatforms = platforms.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(platformSearch.toLowerCase()) && (category === "all" || p.category === category));

  function publishRun(next: SearchRun) { runRef.current = next; setRun(next); }
  async function executeScan(initial: SearchRun) {
    if (controller.current) return;
    const ac = new AbortController(); controller.current = ac; let current = { ...initial, status: "running" as SearchRun["status"] }; publishRun(current); setError(""); setTab("search"); setResultFilter("matches");
    const done = new Set(current.results.map(r => r.id)); const remaining = current.siteIds.filter(id => !done.has(id)); let offset = 0;
    const merge = (result: SearchResult) => { current = { ...current, results: [...current.results.filter(r => r.id !== result.id), result], updatedAt: new Date().toISOString() }; publishRun(current); };
    const worker = async () => {
      while (offset < remaining.length && !ac.signal.aborted) {
        const ids = remaining.slice(offset, offset + 6); offset += ids.length;
        try {
          const response = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: current.mode, query: current.query, ids }), signal: ac.signal });
          if (!response.ok) { const body = await response.json().catch(() => ({})) as {error?: string}; throw new Error(body.error || `The scan server returned ${response.status}.`); }
          if (!response.body) throw new Error("The scan server returned no results.");
          const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
          const consume = (line: string) => { if (!line.trim()) return; const data = JSON.parse(line); if (data.type === "result") merge(data.result); };
          try { while (true) { const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || ""; lines.forEach(consume); } buffer += decoder.decode(); if (buffer.trim()) consume(buffer); } finally { reader.releaseLock(); }
          const missing = ids.filter(id => !current.results.some(r => r.id === id)); if (missing.length) throw new Error("Some checks did not finish. Resume to retry the remaining platforms.");
        } catch (err) { if (!ac.signal.aborted) { setError(err instanceof Error ? err.message : "The connection was interrupted."); ac.abort(); } }
      }
    };
    await Promise.all([worker(), worker()]);
    current = { ...current, status: current.results.length === current.siteIds.length ? "completed" : "paused", updatedAt: new Date().toISOString() }; publishRun(current);
    setHistory(previous => [current, ...previous.filter(h => h.id !== current.id)].slice(0, 20)); controller.current = null;
    if (current.status === "completed") setNotice(`Search complete. ${current.results.filter(r => r.status === "found").length} platform matches.`);
  }
  async function startScan() {
    if (active) return; setError("");
    const clean = query.trim().replace(mode === "username" ? /^@/ : /$^/, "");
    if (!clean || (mode === "email" ? !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(clean) : !/^[\p{L}\p{N}_. -]{1,64}$/u.test(clean))) { setError(mode === "email" ? "Enter a complete email address." : "Enter a username, without a profile URL."); return; }
    if (!online) { setError("Reconnect to run live checks. Your existing results are still available."); return; }
    if (!selectedPlatforms.length) { setError("Select at least one platform."); return; }
    const now = new Date().toISOString(); const next: SearchRun = { id: crypto.randomUUID(), mode, query: mode === "email" ? clean.toLowerCase() : clean, siteIds: selectedPlatforms.map(p => p.id), results: [], status: "running", startedAt: now, updatedAt: now };
    void executeScan(next); setTimeout(() => resultSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }
  function toggleSaved(result: SearchResult) { if (!run) return; const key = `${run.id}:${result.id}`; setSaved(previous => previous.includes(key) ? previous.filter(k => k !== key) : [...previous, key]); }
  function openHistory(item: SearchRun) { if (active) { setNotice("Pause the current scan before opening a saved search."); return; } const next = { ...item, status: item.status === "running" ? "paused" : item.status } as SearchRun; publishRun(next); setQuery(next.query); setMode(next.mode); setTab("search"); setResultFilter("matches"); }
  function exportResults(format: "csv" | "json") {
    if (!run) return; const content = format === "json" ? JSON.stringify({ ...run, exportedAt: new Date().toISOString(), attribution: "Blackbird / WhatsMyName. A matching username does not prove shared ownership." }, null, 2) : buildCsv(run);
    const url = URL.createObjectURL(new Blob([content], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `blackbird-${run.query.replace(/[^a-z0-9_-]/gi, "_")}-${run.startedAt.slice(0, 10)}.${format}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setShowExport(false);
  }
  function retryUnresolved() { if (!run || active) return; const retry = run.results.filter(r => ["error", "unknown", "blocked"].includes(r.status)).map(r => r.id); if (!retry.length) { setNotice("There are no checks to retry."); return; } void executeScan({ ...run, results: run.results.filter(r => !retry.includes(r.id)), status: "running" }); }
  function changeMode(next: SearchMode) { setMode(next); setCategory("all"); setSelected([]); setScope("quick"); setError(""); }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Blackbird home"><span className="brand-icon"><Bird size={26} strokeWidth={1.7} /></span><span>blackbird<span className="brand-dot">.</span></span></a>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation">{NAV.map(item => <button key={item.id} className={`nav-item ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}><item.icon size={19} /><span>{item.label}</span>{item.id === "history" && history.length > 0 && <small>{history.length}</small>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="private-note"><ShieldCheck size={19} /><div><strong>Private by design</strong><span>Your searches stay yours.</span></div></div><a href="https://github.com/garrettmclain96-prog/blackbird" target="_blank" rel="noopener noreferrer" className="source-link">View your repository <ArrowUpRight size={15}/></a><div className="maker">MCLAIN SYSTEMS <span>01 / MOBILE</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><a className="mobile-brand" href="/"><Bird size={24}/> blackbird.</a><div className="breadcrumb">Workspace <ChevronRight size={13}/><strong>{NAV.find(n => n.id === tab)?.label}</strong></div><div className="header-right"><span className={`connection ${!online ? "offline" : ""}`}><i/>{online ? "Live checks" : "Offline"}</span><span className="account-badge" title="Your private workspace">GM</span></div></header>
      <main>
        {!online && <div className="banner"><Info size={17}/> You’re offline. Saved results remain available; reconnect to search.</div>}
        {tab === "search" && <>
          <section className="page-heading"><div><div className="eyebrow">A CLEARER PICTURE, ONE HANDLE AT A TIME</div><h1>Search beyond<br className="mobile-break"/> the obvious<span>.</span></h1><p>Find where a username appears. Follow the evidence.</p></div><span className="version-tag">BLACKBIRD / MOBILE 1.0</span></section>
          <section className="search-layout">
            <div className="search-panel">
              <div className="panel-heading"><span className="icon-surface"><Radar size={21}/></span><div><h2>Start a search</h2><p>One handle. A wider view.</p></div><span className="live-pill">LIVE</span></div>
              <div className="mode-tabs" role="tablist" aria-label="Search type"><button role="tab" aria-selected={mode === "username"} className={mode === "username" ? "selected" : ""} onClick={() => changeMode("username")} disabled={active}><AtSign size={17}/> Username</button><button role="tab" aria-selected={mode === "email"} className={mode === "email" ? "selected" : ""} onClick={() => changeMode("email")} disabled={active}><Mail size={17}/> Email</button></div>
              <form onSubmit={e => { e.preventDefault(); void startScan(); }}>
                <label className="input-label" htmlFor="query">{mode === "username" ? "Username or handle" : "Email address"}</label>
                <div className="query-input">{mode === "username" ? <AtSign size={20}/> : <Mail size={20}/>}<input id="query" type={mode === "email" ? "email" : "text"} inputMode={mode === "email" ? "email" : "text"} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder={mode === "username" ? "Enter a username" : "name@example.com"} value={query} onChange={e => setQuery(e.target.value)} disabled={active} maxLength={mode === "email" ? 254 : 65}/>{query && !active && <button type="button" aria-label="Clear input" onClick={() => setQuery("")}><X size={17}/></button>}</div>
                <div className="scope-heading"><span className="input-label">Search scope</span><button type="button" className="text-button" onClick={() => setTab("platforms")} disabled={active}><SlidersHorizontal size={13}/> Customize</button></div>
                <div className="scope-grid">{[{ id: "quick", title: mode === "email" ? "Read-only checks" : "Quick scan", note: mode === "email" ? `${platforms.filter(p => p.automated).length} available providers` : `${platforms.filter(p => p.popular).length} popular platforms` }, { id: "all", title: "Full catalog", note: `${platforms.length} catalog entries` }].map(s => <button type="button" key={s.id} className={`scope-card ${scope === s.id ? "selected" : ""}`} disabled={active} onClick={() => setScope(s.id as "quick" | "all")}><span className="radio-dot"/><strong>{s.title}</strong><small>{s.note}</small></button>)}</div>
                {scope === "custom" && <div className="custom-selection"><CheckCheck size={15}/>{selected.length} custom platforms selected <button type="button" onClick={() => setTab("platforms")}>Edit</button></div>}
                {mode === "email" && <p className="field-hint">Automated email checks use read-only requests. Other providers are marked manual-only.</p>}
                {error && <div className="form-error" role="alert"><Info size={16}/>{error}</div>}
                {catalogError ? <button type="button" className="primary-button" onClick={() => void loadCatalog()}><RotateCcw size={17}/> Reload platform catalog</button> : <button className="primary-button" type="submit" disabled={active || !catalog || !online || !selectedPlatforms.length}>{active ? <><LoaderCircle size={19} className="spin"/> Search in progress</> : <><Search size={19}/> Search {selectedPlatforms.length || ""} platforms <ArrowRight size={18}/></>}</button>}
              </form>
              <div className="search-footnote"><ShieldCheck size={14}/><span>Live platform responses. No fabricated matches.</span></div>
            </div>
            <div className="insight-panel"><div className="radar-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><div className="crosshair"/><div className="radar-core"><Bird size={42} strokeWidth={1.25}/></div><span className="orbit-point point-one"/><span className="orbit-point point-two"/><span className="orbit-point point-three"/><span className="radar-label label-one">PUBLIC SIGNALS</span><span className="radar-label label-two">CONNECTED CONTEXT</span></div><div className="insight-copy"><span className="dark-eyebrow">LESS GUESSWORK. MORE CLARITY.</span><h2>Follow the handle.<br/>Find the connections.</h2><p>Built on Blackbird and the community-maintained WhatsMyName catalog.</p><div className="insight-stats"><div><strong>{catalog?.username.length || "—"}</strong><span>username entries</span></div><div><strong>01</strong><span>private workspace</span></div></div></div></div>
          </section>
          {!run && <section className="starter-grid"><div><span className="step-number">01</span><h3>Pick your scope</h3><p>Start with popular platforms or choose the ones that matter.</p></div><div><span className="step-number">02</span><h3>Watch results arrive</h3><p>Matches, missing accounts, and blocked checks stay separate.</p></div><div><span className="step-number">03</span><h3>Keep the evidence</h3><p>Bookmark profiles and export your results to CSV or JSON.</p></div></section>}
          {run && <section className="results-section" ref={resultSection}>
            <div className="section-title"><div><div className="eyebrow">{run.status === "running" ? "SEARCH IN PROGRESS" : run.status === "paused" ? "SEARCH PAUSED" : "SEARCH COMPLETE"}</div><h2 className="query-title">{run.mode === "username" ? "@" : ""}{run.query}</h2><p>{formatDate(run.startedAt)} · {run.siteIds.length} platforms in this search</p></div><div className="result-actions">{active ? <button className="secondary-button" onClick={() => controller.current?.abort()}><Pause size={16}/> Pause</button> : run.status === "paused" ? <button className="secondary-button" onClick={() => void executeScan(run)} disabled={!online}><Play size={16}/> Resume</button> : <button className="icon-button" title="Retry unresolved checks" aria-label="Retry unresolved checks" onClick={retryUnresolved}><RotateCcw size={18}/></button>}<div className="export-container"><button className="secondary-button" onClick={() => setShowExport(!showExport)} disabled={!run.results.length}><ArrowDownToLine size={16}/><span>Export</span></button>{showExport && <div className="export-menu"><button onClick={() => exportResults("csv")}><ArrowDownToLine size={16}/> CSV spreadsheet</button><button onClick={() => exportResults("json")}><FileJson size={16}/> JSON evidence</button></div>}</div></div></div>
            <div className="progress-track" role="progressbar" aria-label="Search progress" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${percent}%` }}/></div><div className="progress-label"><span>{active && <LoaderCircle size={12} className="spin"/>}{run.results.length} of {run.siteIds.length} checked</span><span>{percent}%</span></div>
            <div className="stat-grid"><button className={resultFilter === "matches" ? "selected" : ""} onClick={() => setResultFilter("matches")}><span className="stat-label"><i className="green-dot"/> Matches</span><strong>{found}</strong><small>Account-exists rule matched</small></button><button className={resultFilter === "not_found" ? "selected" : ""} onClick={() => setResultFilter("not_found")}><span className="stat-label"><i className="gray-dot"/> Not found</span><strong>{notFound}</strong><small>Account-missing response</small></button><button className={resultFilter === "unresolved" ? "selected" : ""} onClick={() => setResultFilter("unresolved")}><span className="stat-label"><i className="amber-dot"/> Unresolved</span><strong>{unresolved}</strong><small>Blocked, uncertain or unavailable</small></button></div>
            <div className="results-toolbar"><div className="filter-tabs">{[{id:"matches",label:"Matches"},{id:"all",label:"All checks"},{id:"saved",label:"Saved"}].map(f => <button key={f.id} className={resultFilter === f.id ? "selected" : ""} onClick={() => setResultFilter(f.id)}>{f.label}</button>)}</div><div className="small-search"><Search size={16}/><input aria-label="Filter results" placeholder="Filter results" value={resultSearch} onChange={e => setResultSearch(e.target.value)}/></div></div>
            {visibleResults.length ? <div className="result-list">{visibleResults.map(result => <article className="result-card" key={result.id}><div className={`platform-monogram color-${result.name.charCodeAt(0) % 5}`}>{initials(result.name)}</div><div className="result-main"><div className="result-name"><h3>{result.name}</h3><span className={`status-tag ${result.status}`}>{LABELS[result.status]}</span></div><span className="result-category">{displayCategory(result.category)} · {result.httpStatus ? `HTTP ${result.httpStatus} · ` : ""}{(result.elapsedMs / 1000).toFixed(1)}s</span><p>{result.detail}</p></div><div className="result-card-actions"><button className={`icon-button ${saved.includes(`${run.id}:${result.id}`) ? "bookmarked" : ""}`} aria-label={`${saved.includes(`${run.id}:${result.id}`) ? "Unsave" : "Save"} ${result.name}`} onClick={() => toggleSaved(result)}><Bookmark size={18} fill={saved.includes(`${run.id}:${result.id}`) ? "currentColor" : "none"}/></button>{result.url && <a href={result.url} target="_blank" rel="noopener noreferrer" className="icon-button" aria-label={`Open ${result.name} profile`}><ArrowUpRight size={20}/></a>}</div></article>)}</div> : <div className="empty-state">{active ? <><Radar size={29}/><h3>Listening for matches</h3><p>Checks are running. You can view every response under All checks.</p></> : <><Search size={28}/><h3>{resultFilter === "saved" ? "No saved profiles yet" : "No results in this view"}</h3><p>{resultFilter === "matches" ? "Review unresolved checks before concluding there are no accounts." : "Try another filter or save a profile using its bookmark."}</p></>}</div>}
            <p className="evidence-note"><Info size={14}/> A matching handle is a lead, not proof that profiles belong to the same person. Platform rules and access can change.</p>
          </section>}
        </>}
        {tab === "history" && <><section className="page-heading"><div><div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div><h1>Your search history<span>.</span></h1><p>Recent searches saved on this browser. Export to keep a separate copy.</p></div><span className="count-badge">{history.length} searches</span></section>{history.length ? <div className="history-list">{history.map(item => <article className="history-card" key={item.id}><span className="history-icon">{item.mode === "email" ? <Mail size={21}/> : <AtSign size={23}/>}</span><button className="history-open" onClick={() => openHistory(item)}><strong>{item.query}</strong><span>{formatDate(item.startedAt)} · {item.results.length}/{item.siteIds.length} checked</span></button><div className="history-match-count"><strong>{item.results.filter(r => r.status === "found").length}</strong><span>matches</span></div><span className={`status-tag ${item.status === "completed" ? "found" : "unknown"}`}>{item.status === "completed" ? "Complete" : "Paused"}</span><button className="icon-button" aria-label={`Delete search ${item.query}`} onClick={() => { setHistory(previous => previous.filter(h => h.id !== item.id)); setSaved(previous => previous.filter(k => !k.startsWith(item.id + ":"))); }}><Trash2 size={17}/></button></article>)}</div> : <div className="empty-state large"><History size={35}/><h2>Your next lead starts here</h2><p>Run your first search and it will appear here.</p><button className="primary-button compact" onClick={() => setTab("search")}>Start a search <ArrowRight size={16}/></button></div>}</>}
        {tab === "platforms" && <><section className="page-heading"><div><div className="eyebrow">BUILD YOUR OWN SEARCH</div><h1>The platform directory<span>.</span></h1><p>Browse detection coverage and choose exactly where to look.</p></div></section><div className="directory-toolbar"><div className="mode-tabs small"><button className={mode === "username" ? "selected" : ""} onClick={() => changeMode("username")} disabled={active}><AtSign size={16}/> Username</button><button className={mode === "email" ? "selected" : ""} onClick={() => changeMode("email")} disabled={active}><Mail size={16}/> Email</button></div><div className="small-search"><Search size={17}/><input placeholder="Search platforms" aria-label="Search platforms" value={platformSearch} onChange={e => setPlatformSearch(e.target.value)}/></div><select aria-label="Platform category" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c => <option key={c} value={c}>{displayCategory(c)}</option>)}</select></div><div className="directory-selection"><span>{visiblePlatforms.length} entries · {selected.length} selected</span><div><button className="text-button" disabled={active} onClick={() => { setSelected(previous => [...new Set([...previous, ...visiblePlatforms.filter(p => p.automated).map(p => p.id)])]); setScope("custom"); }}>Select available</button><button className="text-button" disabled={active} onClick={() => { setSelected([]); setScope("quick"); }}>Clear</button></div></div><div className="platform-grid">{visiblePlatforms.map(p => <label className={`directory-card ${selected.includes(p.id) ? "selected" : ""}`} key={p.id}><input type="checkbox" checked={selected.includes(p.id)} disabled={active} onChange={e => { setSelected(previous => e.target.checked ? [...previous, p.id] : previous.filter(id => id !== p.id)); setScope("custom"); }}/><div className={`platform-monogram color-${p.name.charCodeAt(0) % 5}`}>{initials(p.name)}</div><div><strong>{p.name}</strong><span>{displayCategory(p.category)}</span><small className={p.automated ? "available-label" : "manual-label"}>{p.automated ? "Live check available" : "Manual-only entry"}</small></div></label>)}</div>{selected.length > 0 && <div className="selection-dock"><span><strong>{selected.length}</strong> platforms selected</span><button className="primary-button compact" onClick={() => { setScope("custom"); setTab("search"); }}>Use this selection <ArrowRight size={17}/></button></div>}</>}
        {tab === "settings" && <><section className="page-heading"><div><div className="eyebrow">YOUR TOOL. YOUR WORKFLOW.</div><h1>Make it yours<span>.</span></h1><p>A private workspace, ready for your phone.</p></div></section><div className="settings-grid"><article className="settings-card"><span className="icon-surface"><Smartphone size={23}/></span><h2>Keep Blackbird on your iPhone</h2><p>Open this page in Safari, tap the Share button, then <strong>Add to Home Screen</strong>. Turn on Open as Web App if offered.</p><div className="hint-box">Live searches need internet. Keep the app open during a scan; resume if iOS suspends it.</div></article><article className="settings-card"><span className="icon-surface"><ShieldCheck size={23}/></span><h2>Your data stays in your browser</h2><p>Search history and bookmarks are stored locally on this device. Searches contact the selected platforms through the server. No third-party AI profiling is used.</p><p>Browser storage can be cleared by Safari. Export anything you need to keep.</p></article><article className="settings-card"><span className="icon-surface"><Globe2 size={23}/></span><h2>Know what a result means</h2><p><strong>Match:</strong> the configured account-exists response matched. <strong>Not found:</strong> the account-missing response matched. <strong>Unresolved:</strong> access or detection was inconclusive.</p><p>Manual-only entries are never contacted. Email automation uses read-only GET requests.</p></article><article className="settings-card"><span className="icon-surface"><Bird size={23}/></span><h2>Built on open-source work</h2><p>Mobile edition by McLain Systems. Original Blackbird by Lucas Antoniaci. Username rules by Micah Hoffman and WhatsMyName contributors.</p><a href="https://github.com/garrettmclain96-prog/blackbird" target="_blank" rel="noopener noreferrer">Your Blackbird repository <ArrowUpRight size={15}/></a><a href="https://github.com/WebBreacher/WhatsMyName" target="_blank" rel="noopener noreferrer">WhatsMyName · CC BY-SA 4.0 <ArrowUpRight size={15}/></a><small>Catalog snapshot: {catalog?.updated || "loading"}</small></article><article className="settings-card danger-card"><h2>Clear local search data</h2><p>Remove saved searches and bookmarks from this browser. Export first if you want a copy.</p><button className="secondary-button danger-button" disabled={active} onClick={() => { if (!window.confirm("Delete all Blackbird searches and bookmarks from this browser?")) return; setHistory([]); setSaved([]); setRun(null); runRef.current = null; localStorage.removeItem(STORAGE); setNotice("Local search data cleared."); }}><Trash2 size={16}/> Clear browser data</button></article></div></>}
        <footer className="page-footer"><span>BLACKBIRD<span className="footer-dot"> / </span>MCLAIN SYSTEMS</span><span>Public signals. Human judgment.</span></footer>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Mobile navigation">{NAV.map(item => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><item.icon size={21}/><span>{item.label}</span></button>)}</nav>
    {notice && <div className="toast" role="status"><Check size={17}/>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={16}/></button></div>}
  </div>;
}
