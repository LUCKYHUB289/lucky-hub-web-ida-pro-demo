# Deploying LUCKY HUB WEB IDA PRO

The app builds to a plain static site (`dist/`) and needs **no backend to run**.
Drop the folder on any host and the lib reader, hex editor, disassembler,
signature forge, image → `.h` converter and every exporter work immediately.

Two modes come out of the same build:

| Mode | When | What you get |
| --- | --- | --- |
| **Standalone** | `VITE_CONVEX_URL` is not set | Full tool at `/tool`, `/image-to-header` and `/dashboard`. No history, no owner alerts, no DM relay. |
| **Connected** | `VITE_CONVEX_URL` is set at build time | Everything above **plus** recent-lib history, community stats, automatic Telegram alerts with screenshots, and the two-way direct-message channel with the owner. |

There are no accounts in either mode — every visitor works anonymously.

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

### Netlify (app.netlify.com) — recommended

`netlify.toml` is committed, so this is drag-and-drop easy:

1. Go to <https://app.netlify.com> → **Add new site** → **Import an existing project** (or drag `dist/` onto **Deploys** for a manual drop).
2. If importing the repo, Netlify reads `netlify.toml` automatically:
   - build command `npm run build`
   - publish directory `dist`
   - SPA rewrite `/* → /index.html` (200)
3. Under **Site configuration → Environment variables**, add `VITE_CONVEX_URL` (see below). This is a *build-time* value, so it must exist **before** the first build — re-deploy after adding it.
4. Deploy. `public/_redirects` is also copied into `dist/`, so the SPA fallback works even if you publish the folder elsewhere.

### Vercel
`vercel.json` is included. Import the repo — build and SPA rewrites are automatic.

### Cloudflare Pages
Build command `bun run build`, output directory `dist`. `_redirects` is picked up
automatically.

### Deno Deploy (self-hosted server)
The repo ships `main.ts`, a tiny Hono server that serves `dist/` with an SPA
fallback. Run `bun run build`, then point Deno Deploy at `main.ts`.

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

## 3. Optional: turn on history, alerts and the DM relay

Everything here is optional. Add this as a **build-time** variable in your host's
dashboard (it is baked into the bundle at build time):

| Variable | Purpose |
| --- | --- |
| `VITE_CONVEX_URL` | Your Convex deployment URL, e.g. `https://your-app-123.convex.cloud` |

Then set these on the **Convex deployment** (not the static host):

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot HTTP API token used for owner alerts and DMs |
| `TELEGRAM_OWNER_CHAT_ID` | Numeric chat id that receives the alerts |
| `TELEGRAM_WEBHOOK_SECRET` | Shared secret Telegram echoes back on webhook calls |
| `SITE_URL` | Public URL of the deployed site |

Push the functions and schema:

```bash
bun convex dev --once     # local development
bunx convex deploy        # production deployment
```

If `TELEGRAM_BOT_TOKEN` / `TELEGRAM_OWNER_CHAT_ID` are not set, the app falls back
to the values compiled into `src/convex/telegramConfig.ts`. **Move them to real
environment variables** — a token sitting in source can be scraped, and anyone
holding it can control the bot.

### Turning on the DM relay

The direct-message panel needs Telegram to be able to call back into the
deployment, which only works once Convex has a public HTTPS URL (i.e. after
`bunx convex deploy`).

Open **Dashboard → Direct message → Reconnect relay** once. That calls
`setWebhook` with `https://<your-deployment>.convex.site/telegram/webhook`.
The panel then shows a **Relay status** card: green means owner replies will land
in the chat. If it reports the site URL is not public, you are still on a local
deployment — deploy first, then reconnect.

How a conversation flows:

1. Visitor types in **Direct message** → stored in Convex and pushed to the bot.
2. Owner **replies to that Telegram message** (or sends `/reply <threadId> <text>`).
3. Telegram calls the webhook → the reply is stored and appears in the chat live.

---

## 4. Shareable links

| Route | What it is |
| --- | --- |
| `/` | Landing page |
| `/tool` | Public lib workbench |
| `/image-to-header` | Image → C header (`.h`) converter |
| `/dashboard` | Full workspace: workbench, feedback, direct message, history, owner & guide |
