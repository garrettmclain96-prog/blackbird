# Blackbird Mobile

A mobile-first web edition of [garrettmclain96-prog/blackbird](https://github.com/garrettmclain96-prog/blackbird). The original Python CLI remains unchanged in its repository.

## Live app

https://blackbird-mobile-gm.lagarrlee.chatgpt.site

Sign in with the owning ChatGPT account.

## What works

- Live, server-side username checks using a pinned 692-entry WhatsMyName catalog.
- Email catalog with 8 read-only GET checks; the other 8 entries are explicitly marked manual-only and never contacted.
- Quick, full-catalog and custom platform selections; category and platform filters.
- Streamed responses, two concurrent six-platform batches, pause/resume and recovery after a refresh.
- Independent match / not-found / blocked / uncertain / unavailable / manual-only statuses.
- Browser-local history (20 searches), bookmarks and CSV/JSON exports. CSV cells are protected against spreadsheet formula injection.
- Responsive touch interface and an iPhone home-screen manifest.

## Run locally

Use Node 22.13 or newer. From this directory:

```sh
npm install
npm run dev
```

The development runtime is the supplied Sites/Vinext starter. Production builds run on Cloudflare Workers via the Sites build integration. Preserve `sites()` in `vite.config.ts`.

```sh
npm run test:mobile
npm run typecheck
npm run build
```

The deterministic tests mock platform responses to verify detection, redirects, validation, streaming and exports. They do not assert that every third-party platform is reachable.

## iPhone

Open the deployed site in Safari. Share → Add to Home Screen. Keep the app in the foreground for long scans. If iOS suspends it, open the app and tap Resume. Live checks require internet; the home-screen shortcut does not guarantee offline loading.

## Detection limits

A matching username is a lead, not identity proof. The app reports a match only when the upstream status and existence marker match the catalog rule and no missing-account marker is present. An HTTP 200 page alone does not generally qualify. Bot challenges, sign-in walls, errors, timeouts and changed response formats are reported separately. A truncated large response may be inconclusive. Some sites in the catalog require POSTs, credentials or plain HTTP; this mobile release leaves those manual-only. There is no face search or third-party AI profiling.

No entered usernames, emails, response bodies or results are logged by application code. Search history stays in this browser, not a server database. The selected platforms receive their relevant check requests. Browser storage can be cleared; export important results.

## API

- `GET /api/catalog` — platform metadata, IDs, categories and automatic-check availability.
- `POST /api/scan` — JSON `{ "mode": "username", "query": "your-handle", "ids": ["u209"] }`, maximum 6 platform IDs. Returns newline-delimited JSON result events and a final done event. Platform destinations come only from the bundled catalog; client-supplied target URLs are not accepted. Public HTTPS redirects are validated and bounded. Requests time out after 9 seconds and response reads are limited to 768 KiB per site.

The Sites deployment is private by default. Its hosting access gate protects both the UI and API. Keep comparable access controls when deploying elsewhere.

## Attribution

Mobile edition by McLain Systems. Blackbird was created by Lucas Antoniaci. WhatsMyName was created by Micah Hoffman and maintained by its community. See `NOTICE.md` for dataset attribution and changes.
