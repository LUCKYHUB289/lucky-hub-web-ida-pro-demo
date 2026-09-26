# Deploying LUCKY HUB WEB IDA PRO

The app builds to a plain static site (`dist/`) and has **no backend requirement**.
Drop the folder on any host and the lib reader, hex editor, disassembler,
signature forge and all exporters work immediately.

Two modes come out of the same build:

| Mode | When | What you get |
| --- | --- | --- |
| **Standalone** | `VITE_CONVEX_URL` is not set | Full tool at `/tool`. No account, no history, no owner alerts. |
| **Connected** | `VITE_CONVEX_URL` is set at build time | Everything above **plus** email sign-in, `/dashboard` workspace, per-user dump history, feedback and automatic Telegram alerts to the owner. |

---

## 1. Build

```bash
bun install
bun run build      # -> dist/
```

Preview the real build locally:

```bash
bun run preview
```

## 2. Deploy the `dist/` folder

### Any static host / drag & drop
Upload the contents of `dist/` to the web root (Netlify Drop, Cloudflare Pages,
cPanel, nginx, S3 + CloudFront, …). Nothing else is required.

### Vercel
`vercel.json` is included. Import the repo — build and SPA rewrites are automatic.

### Netlify
`netlify.toml` is included, plus `public/_redirects` which is copied into the
build for hosts that read that file directly.

### Cloudflare Pages
Build command `bun run build`, output directory `dist`. `_redirects` is picked up
automatically.

### Deno Deploy (self-hosted server)
The repo already ships `main.ts`, a tiny Hono server that serves `dist/` with an
SPA fallback. Run `bun run build`, then point Deno Deploy at `main.ts`.

### GitHub Pages / S3 / plain nginx (no rewrite rules)
`public/404.html` is copied into `dist/` and acts as the SPA fallback: it stores
the requested route and sends the visitor to the app root, where `index.html`
restores it before React Router starts.

For a **project site** (e.g. `https://user.github.io/luckyhub/`) open
`dist/404.html` and set:

```js
var BASE = "/luckyhub/";
```

### Hosting in a subfolder
A subfolder deploy (`https://example.com/luckyhub/`) needs two small edits:

1. Add `base: "/luckyhub/"` to `defineConfig({ ... })` in `vite.config.ts`.
2. Pass the same value as the router basename in `src/main.tsx`:
   `<BrowserRouter basename="/luckyhub/">`.

Root-domain deploys need neither.

---

## 3. Optional: turn on accounts, history and Telegram alerts

Everything here is optional. Add these as **build-time** environment variables in
your host's dashboard (they are baked into the bundle at build time):

| Variable | Purpose |
| --- | --- |
| `VITE_CONVEX_URL` | Your Convex deployment URL, e.g. `https://your-app-123.convex.cloud` |

Also set these on the **Convex deployment** (not the static host):

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot HTTP API token used for owner alerts |
| `TELEGRAM_OWNER_CHAT_ID` | Numeric chat id that receives the alerts |
| `SITE_URL` | Public URL of the deployed site (used by Convex Auth) |

Create/refresh the deployment with:

```bash
bun convex dev --once     # local development
bunx convex deploy        # push functions + schema to production
```

If `TELEGRAM_BOT_TOKEN` / `TELEGRAM_OWNER_CHAT_ID` are not set, the app falls back
to the values compiled into `src/convex/telegram.ts`. **Move them to real
environment variables** — a token sitting in source can be scraped, and anyone
holding it can control the bot.

> Note: sign-in uses a 6-digit email code. If your host's mail flow is
> restricted, the public `/tool` route still works with no account at all.

---

## 4. Shareable links

| Route | Who |
| --- | --- |
| `/` | Landing page |
| `/tool` | Public workbench — works with or without an account |
| `/auth` | Sign-in (connected builds) |
| `/dashboard` | Signed-in workspace, protected by `RequireAuth` |
